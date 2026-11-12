import {verifyStorageProof} from './storage-proof.js';
import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

export const accountPlace = z.object({ clientKey:z.string().min(1).max(100),kind:z.enum(['home','work','favorite']),label:z.string().trim().min(1).max(80),
  storageProof:z.string().min(1).max(1024).optional(),address:z.string().max(300),attribution:z.string().max(500),lon:z.number().finite().min(-180).max(180),lat:z.number().finite().min(-90).max(90) }).strict();
export const driverPreferences = z.object({voiceEnabled:z.boolean(),voiceLanguage:z.enum(['en-GH','en-GB','en-US']),units:z.enum(['metric','imperial'])}).strict();
type ProviderSession={accessToken:string;refreshToken:string;expiresAt:number};
export interface DriverAuthProvider {
  issuer:string;sendCode(email:string):Promise<void>;verify(email:string,code:string):Promise<ProviderSession>;
  refresh(token:string):Promise<ProviderSession>;user(token:string):Promise<{id:string}>;
  signOut(token:string):Promise<void>;deleteUser(subject:string):Promise<void>;
}
const fail=(statusCode:number)=>Object.assign(new Error('Account request could not be completed.'),{statusCode});
export function supabaseProvider(options:{url?:string;publishableKey?:string;secretKey?:string}):DriverAuthProvider|undefined {
  if(!options.url||!options.publishableKey||!options.secretKey)return;
  const settings={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  // These clients are used only through explicit JWT arguments or public auth flows.
  // A new public auth client per operation avoids cross-user mutable session state.
  const publicClient=()=>createClient(options.url!,options.publishableKey!,settings);
  const admin=createClient(options.url,options.secretKey,settings);
  const session=(value:{access_token:string;refresh_token:string;expires_at?:number}|null):ProviderSession=>{
    if(!value?.access_token||!value.refresh_token||!value.expires_at)throw fail(401);
    return{accessToken:value.access_token,refreshToken:value.refresh_token,expiresAt:value.expires_at*1000};
  };
  return {issuer:new URL(options.url).origin+'/auth/v1',
    async sendCode(email){const {error}=await publicClient().auth.signInWithOtp({email,options:{shouldCreateUser:true}});if(error)throw fail(error.status===429?429:503);},
    async verify(email,token){const {data,error}=await publicClient().auth.verifyOtp({email,token,type:'email'});if(error)throw fail(401);return session(data.session);},
    async refresh(refresh_token){const {data,error}=await publicClient().auth.refreshSession({refresh_token});if(error)throw fail(401);return session(data.session);},
    async user(token){const {data,error}=await publicClient().auth.getUser(token);if(error||!data.user||!data.user.email_confirmed_at)throw fail(error&&(!error.status||error.status>=500)?503:401);return{id:z.uuid().parse(data.user.id)};},
    async signOut(token){const {error}=await admin.auth.admin.signOut(token,'global');if(error&&error.status!==401)throw fail(503);},
    async deleteUser(subject){const {error}=await admin.auth.admin.deleteUser(subject,false);if(error&&error.status!==404)throw fail(503);},
  };
}
export async function processAccountDeletion(db:Pool,provider:DriverAuthProvider,userId:string,subject:string) {
  // Local data is already erased and the account blocked before this external side effect.
  try {await provider.deleteUser(subject);await db.query('UPDATE driver_deletion_jobs SET completed_at=now(),attempts=attempts+1 WHERE user_id=$1',[userId]);return true;}
  catch {await db.query("UPDATE driver_deletion_jobs SET attempts=attempts+1,next_attempt_at=now()+least(3600,power(2,least(attempts,10))*60)*interval '1 second' WHERE user_id=$1",[userId]);return false;}
}
export function registerAccountRoutes(app:FastifyInstance,db:Pool,provider?:DriverAuthProvider,storageKey?:string) {
  const enabled=()=>{if(!provider)throw fail(503);return provider;};
  const bearer=(request:FastifyRequest)=>{const value=request.headers.authorization;if(!value?.startsWith('Bearer ')||value.length>8192)throw fail(401);return value.slice(7);};
  async function identity(request:FastifyRequest){
    const auth=enabled();const token=bearer(request);const subject=await auth.user(token);
    const external=auth.issuer+':'+subject.id;
    const result=await db.query(`INSERT INTO users(external_subject) VALUES($1) ON CONFLICT(external_subject) DO UPDATE SET external_subject=EXCLUDED.external_subject RETURNING id,status`,[external]);
    const row=result.rows[0];if(row.status!=='active')throw fail(403);
    return{userId:row.id as string,subject:subject.id,token,auth};
  }
  const bodyLimit=16384;
  app.get('/v1/auth/status',async()=>({enabled:!!provider,guestNavigation:true,provider:provider?'supabase':null}));
  app.post('/v1/auth/code',{bodyLimit,config:{rateLimit:{max:3,timeWindow:3600000}}},async request=>{
    const auth=enabled();const {email}=z.object({email:z.email().max(254)}).strict().parse(request.body);
    await auth.sendCode(email.toLowerCase());return{message:'If the request is eligible, a sign-in code will arrive by email.'};
  });
  app.post('/v1/auth/verify',{bodyLimit,config:{rateLimit:{max:8,timeWindow:900000}}},async request=>{
    const auth=enabled();const body=z.object({email:z.email().max(254),code:z.string().regex(/^\d{6,8}$/)}).strict().parse(request.body);
    return auth.verify(body.email.toLowerCase(),body.code);
  });
  app.post('/v1/auth/refresh',{bodyLimit,config:{rateLimit:{max:10,timeWindow:60000}}},async request=>{
    const auth=enabled();const {refreshToken}=z.object({refreshToken:z.string().min(1).max(8192)}).strict().parse(request.body);return auth.refresh(refreshToken);
  });
  app.post('/v1/auth/sign-out',{bodyLimit},async request=>{await enabled().signOut(bearer(request));return{signedOut:true};});
  app.get('/v1/me',async request=>{
    const {userId}=await identity(request);
    const [places,prefs]=await Promise.all([db.query('SELECT client_key AS "clientKey",kind,label,address,attribution,storage_proof AS "storageProof",ST_X(geometry) AS lon,ST_Y(geometry) AS lat FROM driver_saved_places WHERE user_id=$1 ORDER BY created_at,id LIMIT 50',[userId]),db.query('SELECT voice_enabled AS "voiceEnabled",voice_language AS "voiceLanguage",units FROM driver_preferences WHERE user_id=$1',[userId])]);
    return{id:userId,role:'driver',places:places.rows.map(({storageProof,...p})=>({...p,...(storageProof?{storageProof}:{})})),preferences:prefs.rows[0]??{voiceEnabled:true,voiceLanguage:'en-GH',units:'metric'}};
  });
  app.post('/v1/me/sync',{bodyLimit:65536,config:{rateLimit:{max:6,timeWindow:60000}}},async request=>{
    const {userId}=await identity(request);const body=z.object({places:z.array(accountPlace).max(50),preferences:driverPreferences}).strict().parse(request.body);
    if(new Set(body.places.map(p=>p.clientKey)).size!==body.places.length||['home','work'].some(kind=>body.places.filter(p=>p.kind===kind).length>1))throw fail(400);
    if(body.places.some(p=>p.attribution!=='User entered'&&!verifyStorageProof(p.storageProof,p.lon,p.lat,storageKey)))throw Object.assign(new Error('Refresh provider places in search before backing them up. Storage permission could not be verified.'),{statusCode:400});
    const c=await db.connect();try{
      await c.query('BEGIN');
      // Lock against concurrent sync and account deletion. Recheck active status under that lock.
      const owner=await c.query('SELECT status FROM users WHERE id=$1 FOR UPDATE',[userId]);if(owner.rows[0]?.status!=='active')throw fail(403);
      await c.query('DELETE FROM driver_saved_places WHERE user_id=$1',[userId]);
      for(const p of body.places)await c.query(`INSERT INTO driver_saved_places(user_id,client_key,kind,label,address,attribution,geometry,storage_proof) VALUES($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7,$8),4326),$9)`,[userId,p.clientKey,p.kind,p.label,p.address,p.attribution,p.lon,p.lat,p.storageProof??null]);
      await c.query(`INSERT INTO driver_preferences(user_id,voice_enabled,voice_language,units) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET voice_enabled=$2,voice_language=$3,units=$4,updated_at=now()`,[userId,body.preferences.voiceEnabled,body.preferences.voiceLanguage,body.preferences.units]);
      await c.query('COMMIT');return{saved:true};
    }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  });
  app.post('/v1/me/erase-data',{bodyLimit},async request=>{
    const {userId}=await identity(request);const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);await c.query('DELETE FROM driver_saved_places WHERE user_id=$1',[userId]);await c.query('DELETE FROM driver_preferences WHERE user_id=$1',[userId]);await c.query('COMMIT');return{erased:true};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  });
  app.post('/v1/me/delete-account',{bodyLimit,config:{rateLimit:{max:3,timeWindow:3600000}}},async(request,reply)=>{
    const {userId,subject,auth}=await identity(request);z.object({confirm:z.literal('DELETE')}).strict().parse(request.body);
    const c=await db.connect();try{await c.query('BEGIN');await c.query("UPDATE users SET status='deleted',deleted_at=now() WHERE id=$1",[userId]);await c.query('DELETE FROM driver_saved_places WHERE user_id=$1',[userId]);await c.query('DELETE FROM driver_preferences WHERE user_id=$1',[userId]);await c.query('UPDATE devices SET user_id=NULL WHERE user_id=$1',[userId]);await c.query('UPDATE incident_reports SET submitted_by_user=NULL WHERE submitted_by_user=$1',[userId]);await c.query('UPDATE incident_confirmations SET user_id=NULL WHERE user_id=$1',[userId]);await c.query('INSERT INTO driver_deletion_jobs(user_id,provider_subject,provider_issuer) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',[userId,subject,auth.issuer]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    const complete=await processAccountDeletion(db,auth,userId,subject);return reply.code(complete?200:202).send({localDataDeleted:true,providerDeletion:complete?'complete':'queued'});
  });
}
