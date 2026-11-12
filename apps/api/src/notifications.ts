import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import type {ApiConfig} from './config.js';
export const notificationError=(statusCode:number,message:string)=>Object.assign(new Error(message),{statusCode,code:'NOTIFICATION_REQUEST'});
export const pushHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function encryptPushToken(value:string,key:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);return Buffer.concat([iv,cipher.update(value,'utf8'),cipher.final(),cipher.getAuthTag()]);}
export function decryptPushToken(value:Buffer,key:string){if(value.length<29)throw new Error('Invalid encrypted push token');const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),value.subarray(0,12));cipher.setAuthTag(value.subarray(-16));return Buffer.concat([cipher.update(value.subarray(12,-16)),cipher.final()]).toString('utf8');}
const region=z.object({id:z.string().min(1).max(100),label:z.string().trim().min(1).max(80),lon:z.number().finite().min(-4).max(2),lat:z.number().finite().min(4).max(12)}).strict();
export const pushPreferencesSchema=z.object({enabled:z.boolean(),closures:z.boolean(),policy:z.boolean(),marketing:z.literal(false),currentTrip:z.literal(false),timeZone:z.literal('Africa/Accra'),dailyCap:z.union([z.literal(1),z.literal(2)]),permission:z.enum(['granted','denied','unknown']),regions:z.array(region).max(5),expoToken:z.string().regex(/^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/).optional()}).strict();
export async function notificationTransaction<T>(db:Pool,work:(c:PoolClient)=>Promise<T>){const c=await db.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export function notificationAuth(db:Pool){return async(request:FastifyRequest)=>{const token=request.headers.authorization?.replace(/^Bearer /,'')??'';if(!/^[a-f0-9]{64}$/.test(token))throw notificationError(401,'Notification registration expired. Enable again.');const row=(await db.query('SELECT * FROM notification_installations WHERE auth_hash=$1 AND auth_expires_at>now()',[pushHash(token)])).rows[0];if(!row)throw notificationError(401,'Notification registration expired. Enable again.');return row;};}
export async function validNotificationEvent(db:Pool|PoolClient,kind:string,id:string,revision:number,installation:string){
 if(kind==='policy')return(await db.query(`SELECT p.id,p.title,p.body,p.source_reference,p.source_url,p.expires_at FROM current_policy_announcements p JOIN notification_installations i ON i.id=$3 WHERE p.id=$1 AND p.admin_revision_seq=$2 AND i.enabled AND i.policy AND i.permission='granted' AND i.lease_until>now()`,[id,revision,installation])).rows[0];
 return(await db.query(`SELECT r.id,'Community-reviewed road closure' AS title,'A reviewed community closure is active near a saved region. Road conditions may change; check current information.' AS body,r.expires_at FROM incident_reports r JOIN notification_installations i ON i.id=$2 WHERE r.id=$1 AND i.enabled AND i.closures AND i.permission='granted' AND i.lease_until>now() AND r.community_status='verified' AND r.incident_type='closure' AND NOT r.is_synthetic AND r.expires_at>now() AND EXISTS(SELECT 1 FROM notification_regions g WHERE g.installation_id=i.id AND ST_DWithin(g.geometry::geography,r.geometry::geography,5000))`,[id,installation])).rows[0];
}
export function registerNotificationRoutes(app:FastifyInstance,db:Pool,config:ApiConfig){
 const auth=notificationAuth(db),configured=!!config.NOTIFICATION_TOKEN_KEY;
 app.get('/v1/notifications/status',async()=>({remoteEnabled:config.PUSH_DELIVERY_ENABLED==='true'&&configured&&!!config.EXPO_PUSH_ACCESS_TOKEN,timeZone:'Africa/Accra',marketing:false,currentTrip:false,dailyMax:2,weeklyMax:6}));
 app.post('/v1/notifications/session',{config:{rateLimit:{max:3,timeWindow:86400000}}},async request=>{
  if(!configured)throw notificationError(503,'Remote notifications are not configured yet. Local reminders can still be used.');
  const{platform}=z.object({platform:z.enum(['android','ios'])}).strict().parse(request.body);const token=randomBytes(32).toString('hex');
  return notificationTransaction(db,async c=>{const device=(await c.query('INSERT INTO devices(platform) VALUES($1) RETURNING id',[platform])).rows[0];const row=(await c.query("INSERT INTO notification_installations(device_id,auth_hash,auth_expires_at) VALUES($1,$2,now()+interval '90 days') RETURNING auth_expires_at",[device.id,pushHash(token)])).rows[0];return{token,expiresAt:row.auth_expires_at};});
 });
 app.get('/v1/notifications/preferences',async request=>{const i=await auth(request);return{enabled:i.enabled,closures:i.closures,policy:i.policy,permission:i.permission,leaseUntil:i.lease_until,timeZone:i.time_zone,dailyCap:i.daily_cap,marketing:false,currentTrip:false,regions:(await db.query('SELECT id,label,ST_X(geometry) AS lon,ST_Y(geometry) AS lat FROM notification_regions WHERE installation_id=$1 ORDER BY id',[i.id])).rows};});
 app.post('/v1/notifications/preferences',{bodyLimit:12288,config:{rateLimit:{max:10,timeWindow:60000}}},async request=>{
  const i=await auth(request),b=pushPreferencesSchema.parse(request.body);
  if(b.enabled&&(b.permission!=='granted'||!b.expoToken||!configured))throw notificationError(400,'Allow phone notifications and register this device first.');
  if(b.enabled&&b.closures&&!b.regions.length)throw notificationError(400,'Choose a saved region for closure notifications.');
  if(new Set(b.regions.map(r=>r.id)).size!==b.regions.length)throw notificationError(400,'Duplicate saved region.');
  return notificationTransaction(db,async c=>{
   await c.query('SELECT id FROM notification_installations WHERE id=$1 FOR UPDATE',[i.id]);
   await c.query(`UPDATE notification_installations SET enabled=$2,closures=$3,policy=$4,permission=$5,daily_cap=$6,consented_at=CASE WHEN $2 AND NOT enabled THEN now() WHEN $2 THEN coalesce(consented_at,now()) ELSE consented_at END,lease_until=CASE WHEN $2 THEN now()+interval '24 hours' ELSE NULL END,updated_at=now() WHERE id=$1`,[i.id,b.enabled,b.closures,b.policy,b.permission,b.dailyCap]);
   await c.query('UPDATE devices SET notifications_opt_in=$2,consented_at=CASE WHEN $2 THEN now() ELSE consented_at END,last_seen_at=now() WHERE id=$1',[i.device_id,b.enabled]);
   await c.query('DELETE FROM notification_regions WHERE installation_id=$1',[i.id]);
   for(const r of b.regions)await c.query('INSERT INTO notification_regions(installation_id,id,label,geometry) VALUES($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326))',[i.id,r.id,r.label,Math.round(r.lon*50)/50,Math.round(r.lat*50)/50]);
   if(b.enabled&&b.expoToken){const fingerprint=pushHash(b.expoToken);await c.query(`INSERT INTO push_tokens(device_id,provider,token_ciphertext,encryption_key_id,token_fingerprint,expires_at) VALUES($1,'expo',$2,$3,$4,now()+interval '24 hours') ON CONFLICT(token_fingerprint) DO UPDATE SET device_id=$1,token_ciphertext=$2,encryption_key_id=$3,revoked_at=NULL,expires_at=now()+interval '24 hours'`,[i.device_id,encryptPushToken(b.expoToken,config.NOTIFICATION_TOKEN_KEY!),config.NOTIFICATION_TOKEN_KEY_ID,fingerprint]);await c.query('UPDATE push_tokens SET revoked_at=now() WHERE device_id=$1 AND token_fingerprint<>$2 AND revoked_at IS NULL',[i.device_id,fingerprint]);}
   else await c.query('UPDATE push_tokens SET revoked_at=now() WHERE device_id=$1 AND revoked_at IS NULL',[i.device_id]);
   await c.query(`UPDATE notification_queue SET status='skipped',last_error='preference_change' WHERE installation_id=$1 AND status='pending' AND (NOT $2 OR (kind='closure' AND NOT $3) OR (kind='policy' AND NOT $4))`,[i.id,b.enabled,b.closures,b.policy]);return{saved:true,leaseHours:b.enabled?24:0};
  });
 });
 app.post('/v1/notifications/erase',async request=>{const i=await auth(request);await db.query('DELETE FROM devices WHERE id=$1',[i.device_id]);return{erased:true};});
 app.get('/v1/notifications/inbox',async request=>{const i=await auth(request);const rows=(await db.query(`SELECT kind,source_id,source_revision FROM notification_queue WHERE installation_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 20`,[i.id])).rows;const items=[];for(const r of rows){const event=await validNotificationEvent(db,r.kind,r.source_id,r.source_revision,i.id);if(event)items.push({...event,kind:r.kind,evidence:r.kind==='closure'?'community_reviewed':'official_source'});}return{items};});
}
