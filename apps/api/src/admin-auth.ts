import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
export type AdminRole='viewer'|'reviewer'|'editor'|'administrator';
export interface AdminIdentity{subject:string;issuer:string;aal:'aal1'|'aal2';expiresAt:number}
export interface AdminTokenSession{accessToken:string;refreshToken:string;expiresAt:number}
export interface AdminAuthProvider{
 identity(token:string):Promise<AdminIdentity>;signIn(email:string,password:string):Promise<AdminTokenSession>;
 memberExists?(subject:string):Promise<boolean>;
}
export const denied=(statusCode:number,message='Admin authorization required.')=>Object.assign(new Error(message),{statusCode,code:'OPS_REQUEST'});
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function managedAdminAuth(url?:string,key?:string,secret?:string):AdminAuthProvider|undefined{
 if(!url||!key||!secret)return;const issuer=new URL(url).origin+'/auth/v1';
 const client=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
 const pack=(s:{access_token:string;refresh_token:string;expires_at?:number}|null):AdminTokenSession=>{if(!s?.access_token||!s.refresh_token||!s.expires_at)throw denied(401);return{accessToken:s.access_token,refreshToken:s.refresh_token,expiresAt:s.expires_at*1000};};
 return{
  async identity(token){const {data,error}=await client().auth.getUser(token);if(error||!data.user?.email_confirmed_at)throw denied(error&&(!error.status||error.status>=500)?503:401);
   // Decode only after the configured provider has validated this exact signed token.
   let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{throw denied(401);}
   if(claims.sub!==data.user.id||claims.iss!==issuer||!Number.isFinite(claims.exp)||claims.exp*1000<=Date.now())throw denied(401);
   return{subject:z.uuid().parse(data.user.id),issuer,aal:claims.aal==='aal2'?'aal2':'aal1',expiresAt:claims.exp*1000};
  },
  async signIn(email,password){const {data,error}=await client().auth.signInWithPassword({email,password});if(error)throw denied(error.status===429?429:401);return pack(data.session);},
  async memberExists(subject){const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await admin.auth.admin.getUserById(subject);return !error&&!!data.user;},
 };
}
export interface AdminActor extends AdminIdentity{role:AdminRole;name:string;token:string}
export function adminAccess(db:Pool,provider?:AdminAuthProvider){
 return async(request:FastifyRequest,roles:AdminRole[]=['viewer','reviewer','editor','administrator']):Promise<AdminActor>=>{
  if(!provider)throw denied(503);const header=request.headers.authorization;if(!header?.startsWith('Bearer ')||header.length>8192)throw denied(401);
  const token=header.slice(7);const identity=await provider.identity(token);
  const member=await db.query(`SELECT m.role FROM admin_members m JOIN admin_sessions s ON s.issuer=m.issuer AND s.subject=m.subject
   WHERE m.issuer=$1 AND m.subject=$2 AND m.active AND s.token_hash=$3 AND s.revoked_at IS NULL AND s.expires_at>now()`,[identity.issuer,identity.subject,tokenHash(token)]);
  const role=member.rows[0]?.role as AdminRole|undefined;
  if(!role||!roles.includes(role))throw denied(403);
  return{...identity,token,role,name:'admin:'+identity.subject};
 };
}
export function registerAdminAuth(app:FastifyInstance,db:Pool,provider?:AdminAuthProvider){
 const access=adminAccess(db,provider);
 async function register(session:AdminTokenSession){
  if(!provider)throw denied(503);const identity=await provider.identity(session.accessToken);
  const m=await db.query('SELECT role FROM admin_members WHERE issuer=$1 AND subject=$2 AND active',[identity.issuer,identity.subject]);if(!m.rows[0])throw denied(403);
  await db.query(`INSERT INTO admin_sessions(token_hash,issuer,subject,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(token_hash) DO NOTHING`,[tokenHash(session.accessToken),identity.issuer,identity.subject,new Date(Math.min(identity.expiresAt,Date.now()+4*3600000))]);
  await db.query(`INSERT INTO admin_action_logs(actor,action,entity,comment) VALUES($1,'sign_in','session','Managed provider identity validated')`,['admin:'+identity.subject]);
  return{...session,role:m.rows[0].role,aal:identity.aal};
 }
 app.post('/v1/ops/login',{bodyLimit:12288,config:{rateLimit:{max:8,timeWindow:900000}}},async request=>{if(!provider)throw denied(503);const body=z.object({email:z.email().max(254),password:z.string().min(1).max(1024)}).strict().parse(request.body);return register(await provider.signIn(body.email,body.password));});
 app.get('/v1/ops/session',async request=>{const actor=await access(request);return{role:actor.role,subject:actor.subject,aal:actor.aal,mfaRequired:false};});
 app.post('/v1/ops/logout',async request=>{const actor=await access(request);await db.query('UPDATE admin_sessions SET revoked_at=now() WHERE issuer=$1 AND subject=$2',[actor.issuer,actor.subject]);await db.query("INSERT INTO admin_action_logs(actor,action,entity,comment) VALUES($1,'sign_out','session','Operator signed out')",[actor.name]);return{signedOut:true};});
 return access;
}
