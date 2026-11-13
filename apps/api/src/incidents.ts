import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { registerIncidentRealtime } from './incident-realtime.js';
import { registerContributions } from './contributions.js';
import type { CommunityIncident, IncidentCategory } from '@rova/shared';

export const incidentCategories = ['pothole','flood','collision','closure','congestion','obstacle'] as const;
const point = { lon: z.number().finite().min(-4).max(2), lat: z.number().finite().min(4).max(12) };
const fix = z.object({ ...point, accuracy: z.number().positive().max(50), timestamp: z.number().int().positive() }).strict();
const safety = z.enum(['parked','passenger']);
export const incidentSubmission = z.object({ category: z.enum(incidentCategories), fix, interaction: safety,
  // eslint-disable-next-line no-control-regex -- Reject non-printing control characters in public report notes.
  note: z.string().trim().max(280).refine(v=>!/[\u0000-\u0008\u000b-\u001f]/.test(v)).optional() }).strict();
const voteBody = z.object({ decision: z.enum(['confirm','not_there']), fix, interaction: safety }).strict();
const moderationBody = z.object({ revision: z.number().int().positive(), status: z.enum(['verified','rejected']), reason: z.string().trim().min(10).max(500) }).strict();
export const expiryHours: Record<IncidentCategory, number> = { pothole: 24, flood: 4, collision: 2, closure: 6, congestion: 0.5, obstacle: 4 };
export function approximatePoint(lon: number, lat: number): [number,number] { return [Math.round(lon*1000)/1000,Math.round(lat*1000)/1000]; }
export function aggregateConfidence(confirmations: number, notThere: number): number { return Math.round((confirmations+1)/(confirmations+notThere+3)*100)/100; }
const sha = (value: string)=>createHash('sha256').update(value).digest('hex');
const failure = (statusCode: number, message: string)=>Object.assign(new Error(message),{statusCode});
function fresh(f: z.infer<typeof fix>) { if (Date.now()-f.timestamp>60000 || f.timestamp>Date.now()+5000) throw failure(400,'Use a fresh location.'); }
function dto(r: Record<string, any>): CommunityIncident {
  return {id:r.id,category:r.category,status:r.status,coordinate:[Number(r.lon),Number(r.lat)],approximateRadiusMeters:Number(r.accuracy_meters),
    reportedAt:new Date(r.observed_at).toISOString(),expiresAt:new Date(r.expires_at).toISOString(),revision:r.revision,
    confirmations:r.confirmations,notThere:r.not_there,confidence:aggregateConfidence(r.confirmations,r.not_there),evidence:'community',authorityVerified:false};
}
async function transaction<T>(db: Pool, work: (c: PoolClient)=>Promise<T>): Promise<T> {
  const c=await db.connect(); try {await c.query('BEGIN'); const value=await work(c); await c.query('COMMIT'); return value;}
  catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
async function quota(c:PoolClient, key:string, max:number, seconds:number) {
  const r=await c.query(`INSERT INTO incident_abuse_buckets(bucket_key,window_start,count)
    VALUES($1,to_timestamp(floor(extract(epoch from now())/$2)*$2),1)
    ON CONFLICT(bucket_key,window_start) DO UPDATE SET count=incident_abuse_buckets.count+1
    WHERE incident_abuse_buckets.count<$3 RETURNING count`,[sha(key),seconds,max]);
  if(!r.rowCount)throw failure(429,'Too many reports.');
}
export function registerIncidentRoutes(app:FastifyInstance,db:Pool,options:{ipHashKey?:string;moderatorToken?:string;production:boolean;authorizeModerator?:(request:FastifyRequest)=>Promise<string>;authorizeContributions?:(request:FastifyRequest)=>Promise<string>;legacyReadOnly?:boolean}) {
  const key=options.ipHashKey??randomBytes(32).toString('hex');
  const ipKey=(request:FastifyRequest)=>createHmac('sha256',key).update(request.ip).digest('hex');
  const configured=()=>{if(options.production&&!options.ipHashKey)throw failure(503,'Incident reporting is not configured.');};
  async function actor(request:FastifyRequest) {
    configured(); const token=request.headers.authorization?.replace(/^Bearer /,'')??'';
    if(!/^[a-f0-9]{64}$/.test(token))throw failure(401,'Reporting session required.');
    const r=await db.query('SELECT device_id FROM incident_sessions WHERE token_hash=$1 AND NOT revoked AND expires_at>now()',[sha(token)]);
    if(!r.rows[0])throw failure(401,'Reporting session expired.');return r.rows[0].device_id as string;
  }
  async function moderator(request:FastifyRequest) {
    if(options.authorizeModerator)return options.authorizeModerator(request);
    const expected=options.moderatorToken; if(!expected)throw failure(503,'Moderation is not configured.');
    const supplied=request.headers.authorization?.replace(/^Bearer /,'')??'';
    if(Buffer.byteLength(expected)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))throw failure(401,'Moderator authorization required.');
  }
  const bounded={bodyLimit:4096,config:{rateLimit:{max:20,timeWindow:60000}}};
  registerIncidentRealtime(app,db,{actor,moderator,toIncident:dto});
  registerContributions(app,db,{actor,moderator:options.authorizeContributions??moderator,quota,ipKey});
  app.post('/v1/incidents/erase-device',bounded,async request=>{
    const device=await actor(request);
    await transaction(db,async c=>{
      await c.query("SELECT set_config('rova.actor_id','privacy-delete',true)");
      await c.query("UPDATE incident_reports SET submitted_by_device=NULL,description='Anonymous community road report',community_status=CASE WHEN admin_revision_seq>0 THEN 'pending' ELSE community_status END WHERE submitted_by_device=$1",[device]);
      const removed=await c.query('DELETE FROM incident_confirmations WHERE device_id=$1 RETURNING incident_report_id',[device]);
      for(const row of removed.rows)await c.query(`UPDATE incident_reports SET confidence=(SELECT (count(*) FILTER(WHERE decision='confirm')+1.0)/(count(*)+3.0) FROM incident_confirmations WHERE incident_report_id=$1),revision=revision+1 WHERE id=$1`,[row.incident_report_id]);
      await c.query('DELETE FROM incident_sessions WHERE device_id=$1',[device]);
      await c.query('DELETE FROM devices WHERE id=$1',[device]);
    });return{erased:true,publicReports:'Retained anonymously without your notes or device link.'};
  });
  app.post('/v1/incidents/session',bounded,async(request,reply)=>{
    configured(); const {platform}=z.object({platform:z.enum(['android','ios','web'])}).strict().parse(request.body);
    const token=randomBytes(32).toString('hex');
    const expiresAt=await transaction(db,async c=>{
      await quota(c,'sessions:'+ipKey(request),5,86400);
      const d=await c.query('INSERT INTO devices(platform) VALUES($1) RETURNING id',[platform]);
      return (await c.query("INSERT INTO incident_sessions(token_hash,device_id,expires_at) VALUES($1,$2,now()+interval '30 days') RETURNING expires_at",[sha(token),d.rows[0].id])).rows[0].expires_at;
    });
    return reply.code(201).send({token,expiresAt});
  });
  app.post('/v1/incidents',bounded,async(request,reply)=>{
    const device=await actor(request); const body=incidentSubmission.parse(request.body);fresh(body.fix);
    const [lon,lat]=approximatePoint(body.fix.lon,body.fix.lat);
    const result=await transaction(db,async c=>{
      await quota(c,'report-device:'+device,5,3600);await quota(c,'report-ip:'+ipKey(request),20,3600);
      // Serializes the nearest-duplicate check with creation, including concurrent devices.
      await c.query("SELECT pg_advisory_xact_lock(hashtext('incident-create'),hashtext($1))",[body.category]);
      const duplicate=await c.query(`SELECT id FROM incident_reports WHERE community_status IN ('pending','verified') AND expires_at>now()
        AND incident_type=$1 AND ST_DWithin(geometry::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,180)
        ORDER BY created_at DESC LIMIT 1`,[body.category,lon,lat]);
      if(duplicate.rows[0])return {id:duplicate.rows[0].id,duplicate:true};
      const inserted=await c.query(`INSERT INTO incident_reports(geometry,incident_type,description,submitted_by_device,accuracy_meters,
        confidence,observed_at,expires_at,created_by,community_status)
        VALUES(ST_SetSRID(ST_MakePoint($1,$2),4326),$3,$4,$5,150,0.33,date_trunc('minute',now()),now()+$6*interval '1 hour','community','pending') RETURNING id`,
        [lon,lat,body.category,body.note||'Community road report',device,expiryHours[body.category]]);
      return {id:inserted.rows[0].id,duplicate:false};
    });
    return reply.code(result.duplicate?200:201).send({...result,notice:result.duplicate?'Already reported nearby. You can confirm it.':'Submitted as an unverified community report.'});
  });
  app.get('/v1/incidents/nearby',{config:{rateLimit:{max:30,timeWindow:60000}}},async(request)=>{
    await actor(request);
    const q=z.object({lon:z.coerce.number().finite().min(-4).max(2),lat:z.coerce.number().finite().min(4).max(12),radius:z.coerce.number().int().min(100).max(5000).default(2000)}).strict().parse(request.query);
    const [lon,lat]=approximatePoint(q.lon,q.lat);
    const rows=await db.query(`SELECT s.* FROM community_incident_summary s JOIN incident_reports r ON r.id=s.id
      WHERE s.status IN ('pending','verified') AND ST_DWithin(r.geometry::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3)
      ORDER BY ST_Distance(r.geometry::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography),s.id LIMIT 50`,[lon,lat,q.radius]);
    return {reports:rows.rows.map(dto),approximateLocations:true,limit:50};
  });
  app.post('/v1/incidents/:id/votes',bounded,async(request,reply)=>{
    const device=await actor(request);const {id}=z.object({id:z.uuid()}).parse(request.params);const body=voteBody.parse(request.body);fresh(body.fix);
    const [lon,lat]=approximatePoint(body.fix.lon,body.fix.lat);
    const result=await transaction(db,async c=>{
      await quota(c,'vote-device:'+device,20,3600);await quota(c,'vote-ip:'+ipKey(request),60,3600);
      const row=await c.query(`SELECT submitted_by_device,community_status,expires_at>now() AS active,
        ST_DWithin(geometry::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,500) AS nearby FROM incident_reports WHERE id=$1 FOR UPDATE`,[id,lon,lat]);
      const report=row.rows[0];if(!report||!['pending','verified'].includes(report.community_status)||!report.active)throw failure(409,'Report is no longer active.');
      if(!report.nearby)throw failure(400,'Confirm reports only when nearby.');
      if(report.submitted_by_device===device)throw failure(409,'You cannot vote on your own report.');
      const vote=await c.query(`INSERT INTO incident_confirmations(incident_report_id,device_id,decision) VALUES($1,$2,$3)
        ON CONFLICT(incident_report_id,device_id) DO NOTHING RETURNING id`,[id,device,body.decision==='confirm'?'confirm':'deny']);
      if(!vote.rowCount)throw failure(409,'You already voted.');
      const tally=await c.query('SELECT * FROM community_incident_summary WHERE id=$1',[id]);
      // Disputed reports return to review. Votes alone never verify or reject a report.
      const r=tally.rows[0]; if(r.status==='verified'&&r.not_there>=2&&r.not_there>=r.confirmations)
        await c.query("UPDATE incident_reports SET community_status='pending',revision=revision+1,confidence=$2 WHERE id=$1",[id,aggregateConfidence(r.confirmations,r.not_there)]);
      else await c.query('UPDATE incident_reports SET revision=revision+1,confidence=$2 WHERE id=$1',[id,aggregateConfidence(r.confirmations,r.not_there)]);
      return dto((await c.query('SELECT * FROM community_incident_summary WHERE id=$1',[id])).rows[0]);
    });return reply.code(201).send(result);
  });
  app.get('/v1/admin/incidents',async(request)=>{
    await moderator(request); const q=z.object({status:z.enum(['pending','verified','rejected','expired']).default('pending'),before:z.iso.datetime().optional()}).strict().parse(request.query);
    const rows=await db.query(`SELECT s.*,r.description FROM community_incident_summary s JOIN incident_reports r ON r.id=s.id
      WHERE s.status=$1 AND ($2::timestamptz IS NULL OR r.created_at<$2) ORDER BY r.created_at DESC,s.id LIMIT 50`,[q.status,q.before??null]);
    return {reports:rows.rows.map(r=>({...dto(r),note:r.description})),limit:50};
  });
  app.post('/v1/admin/incidents/:id/moderate',bounded,async(request)=>{
    await moderator(request);if(options.legacyReadOnly)throw failure(403,'Use the audited revision workflow.');const {id}=z.object({id:z.uuid()}).parse(request.params);const body=moderationBody.parse(request.body);
    return transaction(db,async c=>{
      await c.query("SELECT set_config('rova.actor_id','incident-moderator',true)");
      const changed=await c.query(`UPDATE incident_reports SET community_status=$3,revision=revision+1
        WHERE id=$1 AND revision=$2 AND community_status IS NOT NULL AND expires_at>now() RETURNING id`,[id,body.revision,body.status]);
      if(!changed.rowCount)throw failure(409,'Report changed or expired. Reload before reviewing.');
      const audit=await c.query(`SELECT id FROM audit_logs WHERE entity_id=$1 AND entity_type='incident_reports' ORDER BY id DESC LIMIT 1`,[id]);
      await c.query(`INSERT INTO moderation_actions(actor_id,entity_type,entity_id,action,reason,audit_log_id)
        VALUES('incident-moderator','incident_report',$1,$2,$3,$4)`,[id,body.status==='verified'?'approve':'reject',body.reason,audit.rows[0].id]);
      return dto((await c.query('SELECT * FROM community_incident_summary WHERE id=$1',[id])).rows[0]);
    });
  });
}
