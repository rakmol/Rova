import type {Pool} from 'pg';
import {accraDay,accraAt,pushWindow} from '@rova/shared';
import type {ApiConfig} from './config.js';
import {decryptPushToken,notificationTransaction,validNotificationEvent} from './notifications.js';
export type PushResult={kind:'accepted';ticketId:string}|{kind:'retry'|'invalid'|'dead'|'unknown';reason:string};
export interface PushTransport{send(token:string,kind:'closure'|'policy',eventId:string):Promise<PushResult>;receipts(ids:string[]):Promise<Record<string,{status:'ok'|'error';error?:string}>>}
export function expoPushTransport(accessToken:string,fetcher:typeof fetch=fetch):PushTransport{
 const post=async(path:string,body:unknown)=>fetcher('https://exp.host/--/api/v2/push/'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 return{
  async send(token,kind,eventId){try{const response=await post('send',[{to:token,title:kind==='closure'?'ROVA: saved-region road update':'ROVA: verified-source policy update',body:kind==='closure'?'A community-reviewed road closure is active near a saved region. Open ROVA when safely stopped for current details.':'A policy announcement from a verified official source is available. Open ROVA when safely stopped to read it.',sound:null,priority:'normal',channelId:'rova-road-updates',ttl:1800,data:{kind,eventId},mutableContent:false}]);
   if(response.status===429)return{kind:'retry',reason:'provider_rate_limit'};if(!response.ok)return{kind:response.status>=500?'unknown':'dead',reason:'provider_http_'+response.status};
   const body=await response.json() as{data?:{status:string;id?:string;details?:{error?:string}}[]};const ticket=body.data?.[0];
   if(ticket?.status==='ok'&&typeof ticket.id==='string'&&ticket.id.length<=100)return{kind:'accepted',ticketId:ticket.id};
   if(ticket?.details?.error==='DeviceNotRegistered')return{kind:'invalid',reason:'DeviceNotRegistered'};
   if(ticket?.details?.error==='MessageRateExceeded')return{kind:'retry',reason:'MessageRateExceeded'};
   return ticket?.status==='error'?{kind:'dead',reason:'provider_rejected'}:{kind:'unknown',reason:'invalid_provider_response'};
  }catch{return{kind:'unknown',reason:'network_outcome_unknown'};}},
  async receipts(ids){if(!ids.length)return{};const response=await post('getReceipts',{ids:ids.slice(0,100)});if(!response.ok)throw new Error('Receipt service unavailable');const data=await response.json()as{data?:Record<string,{status:'ok'|'error';details?:{error?:string}}>};if(!data.data)throw new Error('Invalid receipt response');return Object.fromEntries(Object.entries(data.data).filter(([,v])=>v?.status==='ok'||v?.status==='error').map(([id,v])=>[id,{status:v.status,error:v.details?.error}]));},
 };
}
export async function runNotificationWorker(db:Pool,config:ApiConfig,provided?:PushTransport,limit=20,clock:()=>number=Date.now){
 if(config.PUSH_DELIVERY_ENABLED!=='true')return{disabled:true};
 if(!config.NOTIFICATION_TOKEN_KEY||(!provided&&!config.EXPO_PUSH_ACCESS_TOKEN))throw new Error('Configure private push encryption and Expo enhanced push security before enabling delivery.');
 const transport=provided??expoPushTransport(config.EXPO_PUSH_ACCESS_TOKEN!),counts={accepted:0,retry:0,unknown:0,dead:0,skipped:0,deferred:0,confirmed:0};
 // A stale processing claim might have sent a message before a crash. Do not blindly resend it.
 await db.query("UPDATE notification_queue SET status='unknown',last_error='worker_outcome_unknown' WHERE status='processing' AND claimed_at<now()-interval '10 minutes'");
 await db.query("UPDATE notification_queue q SET status='skipped',last_error='expired_or_opted_out' FROM notification_installations i WHERE q.installation_id=i.id AND q.status='pending' AND (q.expires_at<=now() OR NOT i.enabled OR i.lease_until<=now())");
 await db.query(`INSERT INTO notification_queue(installation_id,event_key,kind,source_id,expires_at)
  SELECT DISTINCT i.id,'closure:'||r.id,'closure',r.id,least(r.expires_at,now()+interval '24 hours') FROM notification_installations i JOIN notification_regions g ON g.installation_id=i.id
  JOIN incident_reports r ON ST_DWithin(g.geometry::geography,r.geometry::geography,5000)
  WHERE i.enabled AND i.closures AND i.permission='granted' AND i.lease_until>now() AND r.community_status='verified' AND r.incident_type='closure' AND NOT r.is_synthetic AND r.expires_at>now() AND r.observed_at>now()-interval '24 hours' LIMIT 1000 ON CONFLICT DO NOTHING`);
 await db.query(`INSERT INTO notification_queue(installation_id,event_key,kind,source_id,source_revision,expires_at)
  SELECT i.id,'policy:'||p.id||':'||p.admin_revision_seq,'policy',p.id,p.admin_revision_seq,least(p.expires_at,now()+interval '48 hours') FROM notification_installations i CROSS JOIN current_policy_announcements p
  WHERE i.enabled AND i.policy AND i.permission='granted' AND i.lease_until>now() AND p.approved_at>=greatest(i.consented_at,now()-interval '7 days') LIMIT 1000 ON CONFLICT DO NOTHING`);
 for(let n=0;n<Math.max(0,Math.min(100,limit));n++){
  const job=await notificationTransaction(db,async c=>{
   const q=(await c.query(`SELECT q.*,i.device_id,i.daily_cap,t.token_ciphertext,t.token_fingerprint,t.encryption_key_id FROM notification_queue q JOIN notification_installations i ON i.id=q.installation_id JOIN push_tokens t ON t.device_id=i.device_id AND t.provider='expo' AND t.revoked_at IS NULL AND t.expires_at>now() WHERE q.status='pending' AND q.available_at<=now() ORDER BY q.created_at,q.id LIMIT 1 FOR UPDATE OF q SKIP LOCKED`)).rows[0];if(!q)return null;
   if(!await validNotificationEvent(c,q.kind,q.source_id,q.source_revision,q.installation_id)){await c.query("UPDATE notification_queue SET status='skipped',last_error='no_longer_current' WHERE id=$1",[q.id]);counts.skipped++;return{skip:true};}
   const now=clock(),window=pushWindow(now);if(window>now){await c.query('UPDATE notification_queue SET available_at=$2 WHERE id=$1',[q.id,new Date(window)]);counts.deferred++;return{skip:true};}
   await c.query("SELECT pg_advisory_xact_lock(hashtext('rova.push-cap'),hashtext($1))",[q.token_fingerprint]);
   const cap=(await c.query(`SELECT count(*) FILTER(WHERE reserved_at>=($2::date::timestamp AT TIME ZONE 'Africa/Accra'))::int AS daily,count(*)::int AS weekly FROM notification_reservations WHERE token_fingerprint=$1 AND queue_id<>$3 AND reserved_at>now()-interval '7 days'`,[q.token_fingerprint,accraDay(now),q.id])).rows[0];
   if(cap.daily>=q.daily_cap||cap.weekly>=6){const tomorrow=new Date(Date.parse(accraDay(now)+'T12:00:00Z')+86400000).toISOString().slice(0,10);await c.query('UPDATE notification_queue SET available_at=$2 WHERE id=$1',[q.id,new Date(accraAt(tomorrow,8))]);counts.deferred++;return{skip:true};}
   await c.query(`INSERT INTO notification_reservations(queue_id,installation_id,token_fingerprint) VALUES($1,$2,$3) ON CONFLICT(queue_id) DO UPDATE SET reserved_at=now(),token_fingerprint=$3`,[q.id,q.installation_id,q.token_fingerprint]);
   await c.query("UPDATE notification_queue SET status='processing',claimed_at=now(),attempts=attempts+1 WHERE id=$1",[q.id]);return q;
  });
  if(!job)break;if(job.skip)continue;
  let result:PushResult;
  try{if(job.encryption_key_id!==config.NOTIFICATION_TOKEN_KEY_ID)throw new Error('Key rotation required');result=await transport.send(decryptPushToken(job.token_ciphertext,config.NOTIFICATION_TOKEN_KEY),job.kind,job.source_id);}catch{result={kind:'dead',reason:'token_or_sender_unavailable'};}
  if(result.kind==='accepted'){counts.accepted++;await db.query("UPDATE notification_queue SET status='accepted',ticket_id=$2,accepted_at=now(),last_error=NULL WHERE id=$1",[job.id,result.ticketId]);}
  else if(result.kind==='retry'&&job.attempts<4){counts.retry++;await db.query("UPDATE notification_queue SET status='pending',available_at=now()+$2*interval '1 second',last_error=$3 WHERE id=$1",[job.id,Math.min(900,30*2**job.attempts),result.reason]);}
  else{const status=result.kind==='unknown'?'unknown':'dead';counts[status]++;await db.query('UPDATE notification_queue SET status=$2,last_error=$3 WHERE id=$1',[job.id,status,result.reason]);if(result.kind==='invalid')await db.query('UPDATE push_tokens SET revoked_at=now() WHERE token_fingerprint=$1',[job.token_fingerprint]);}
 }
 const accepted=(await db.query("SELECT q.id,q.ticket_id,i.device_id FROM notification_queue q JOIN notification_installations i ON i.id=q.installation_id WHERE q.status='accepted' AND q.accepted_at<now()-interval '15 minutes' AND (q.receipt_checked_at IS NULL OR q.receipt_checked_at<now()-interval '15 minutes') LIMIT 100")).rows;
 if(accepted.length){try{const receipts=await transport.receipts(accepted.map(q=>q.ticket_id));for(const q of accepted){const r=receipts[q.ticket_id];await db.query('UPDATE notification_queue SET receipt_checked_at=now() WHERE id=$1',[q.id]);if(!r)continue;await db.query('UPDATE notification_queue SET status=$2,last_error=$3 WHERE id=$1',[q.id,r.status==='ok'?'confirmed':'dead',r.error?'provider_receipt_error':null]);if(r.status==='ok')counts.confirmed++;if(r.error==='DeviceNotRegistered'){await db.query('UPDATE push_tokens SET revoked_at=now() WHERE device_id=$1',[q.device_id]);await db.query("UPDATE notification_installations SET enabled=false,permission='undeliverable' WHERE device_id=$1",[q.device_id]);}}}catch{ /* Bounded retry on the next worker run; no duplicate send. */ }}
 await db.query("DELETE FROM notification_reservations WHERE reserved_at<now()-interval '8 days'");
 await db.query("DELETE FROM notification_queue WHERE expires_at<now()-interval '7 days'");
 await db.query("DELETE FROM devices WHERE id IN (SELECT device_id FROM notification_installations WHERE updated_at<now()-interval '30 days')");
 return counts;
}
