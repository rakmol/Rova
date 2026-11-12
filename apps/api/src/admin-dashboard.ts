import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { registerAdminAuth,denied,type AdminAuthProvider } from './admin-auth.js';
import {actionLog,definitions,editable,entitySchema,inTransaction,publish,record,review,revise,type Entity}from'./admin-records.js';
import {sponsorshipModel,sponsoredAnalytics} from './sponsorship.js';
const comment=z.string().trim().min(10).max(2000);
const mutateRoles=['editor','administrator']as const;
export function registerAdminDashboard(app:FastifyInstance,db:Pool,provider?:AdminAuthProvider,coverageEnabled=false){
 const access=registerAdminAuth(app,db,provider);
 app.get('/v1/ops/schema',async request=>{await access(request);return Object.fromEntries(Object.entries(definitions).map(([key,def])=>[key,z.toJSONSchema(def.schema)]));});
 app.get('/v1/ops/overview',async request=>{
  await access(request);
  const data=await db.query(`SELECT (SELECT count(*)::int FROM road_segments) AS roads,(SELECT count(*)::int FROM map_road_candidates) AS staged_roads,
   (SELECT count(*)::int FROM speed_limit_rules WHERE status='published') AS published_rules,
   (SELECT count(*)::int FROM admin_revisions r WHERE NOT EXISTS(SELECT 1 FROM admin_action_logs a WHERE a.action='publish' AND a.entity=r.entity AND a.entity_id=r.entity_id::text AND a.created_at>=r.created_at)) AS review_revisions,
   (SELECT count(*)::int FROM incident_reports WHERE community_status='pending' AND expires_at>now()) AS pending_hazards,
   (SELECT count(*)::int FROM data_sources WHERE expires_at<=now() OR published_at<now()-interval '180 days') AS stale_sources`);
  return{...data.rows[0],coverageAggregationEnabled:coverageEnabled,sponsoredListingsEnabled:false};
 });
 app.get('/v1/ops/records',async request=>{
  await access(request);const q=z.object({entity:z.enum(['source','road','rule','zone','hazard','policy','sponsor','candidate']),q:z.string().max(100).default(''),status:z.enum(['all','draft','pending_review','published','rejected','withdrawn','pending','verified','expired']).default('all'),page:z.coerce.number().int().min(1).max(1000).default(1)}).strict().parse(request.query);
  if(q.entity==='candidate'){
   const rows=await db.query(`SELECT id,road_name AS label,review_state AS status,osm_way_id::text,proposed_rules,review_issues,
    ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry,.00005))::jsonb AS geometry,count(*) OVER()::int AS total
    FROM map_road_candidates WHERE coalesce(road_name,'') ILIKE $1 ORDER BY id LIMIT 50 OFFSET $2`,['%'+q.q+'%',(q.page-1)*50]);return{rows:rows.rows,total:rows.rows[0]?.total??0,page:q.page};
  }
  const def=definitions[q.entity];const label=q.entity==='sponsor'?'business_name':['source','policy'].includes(q.entity)?'title':q.entity==='road'?'road_name':q.entity==='rule'?"concat(speed_limit_kmh,' km/h / ',vehicle_class)":q.entity==='zone'?'description':'incident_type';
  const geometry=['source','policy'].includes(q.entity)?'NULL':q.entity==='rule'?"(SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(geometry,.00005))::jsonb FROM road_segments WHERE id=t.road_segment_id)":'ST_AsGeoJSON(ST_SimplifyPreserveTopology(t.geometry,.00005))::jsonb';
  const status=q.entity==='hazard'?"CASE WHEN t.expires_at<=now() THEN 'expired' ELSE t.community_status END":`t.${def.status}`;
  const rows=await db.query(`SELECT t.id,${label} AS label,${status} AS status,t.admin_revision_seq,${geometry} AS geometry,
   t.expires_at,(t.expires_at<=now()) AS stale,count(*) OVER()::int AS total FROM ${def.table} t
   WHERE coalesce((${label})::text,'') ILIKE $1 AND ($2='all' OR ${status}=$2)${q.entity==='hazard'?' AND t.community_status IS NOT NULL':''}
   ORDER BY t.id LIMIT 50 OFFSET $3`,['%'+q.q+'%',q.status,(q.page-1)*50]);return{rows:rows.rows,total:rows.rows[0]?.total??0,page:q.page};
 });
 app.get('/v1/ops/detail',async request=>{
  await access(request);const q=z.object({entity:z.enum(['source','road','rule','zone','hazard','policy','sponsor','candidate']),id:z.uuid()}).strict().parse(request.query);
  if(q.entity==='candidate'){const row=(await db.query('SELECT id,road_name,road_class,raw_tags,proposed_rules,review_issues,ST_AsGeoJSON(geometry)::jsonb AS geometry FROM map_road_candidates WHERE id=$1',[q.id])).rows[0];if(!row)throw denied(404);return{candidate:row,revisions:[]};}
  const current=await record(db,q.entity,q.id);const revisions=await db.query(`SELECT r.*,coalesce((SELECT jsonb_agg(jsonb_build_object('reviewer',v.reviewer,'decision',v.decision,'comment',v.comment,'created_at',v.created_at) ORDER BY v.created_at) FROM admin_reviews v WHERE v.revision_id=r.id),'[]') AS reviews FROM admin_revisions r WHERE r.entity=$1 AND r.entity_id=$2 ORDER BY r.sequence DESC LIMIT 50`,[q.entity,q.id]);
  return{...current,editable:editable(q.entity,current.content),revisions:revisions.rows};
 });
 app.post('/v1/ops/revise',{bodyLimit:524288},async request=>{
  const actor=await access(request,[...mutateRoles]);const b=z.object({entity:entitySchema,id:z.uuid().nullable(),expected:z.number().int().min(0).optional(),data:z.unknown(),comment}).strict().parse(request.body);
  return revise(db,actor,b.entity,b.id,b.expected,b.data,b.comment);
 });
 app.post('/v1/ops/revert',async request=>{
  const actor=await access(request,[...mutateRoles]);const b=z.object({revisionId:z.uuid(),expected:z.number().int().min(0),comment}).strict().parse(request.body);
  const entry=(await db.query('SELECT * FROM admin_revisions WHERE id=$1',[b.revisionId])).rows[0];if(!entry?.before_json)throw denied(400,'This revision has no prior content to restore.');
  return revise(db,actor,entry.entity,entry.entity_id,b.expected,editable(entry.entity,entry.before_json),b.comment,entry.id);
 });
 app.post('/v1/ops/review',async request=>{const actor=await access(request,['reviewer','administrator']);const b=z.object({revisionId:z.uuid(),decision:z.enum(['approve','reject']),comment}).strict().parse(request.body);return review(db,actor,b.revisionId,b.decision,b.comment);});
 app.post('/v1/ops/publish',async request=>{const actor=await access(request,['administrator']);const b=z.object({revisionId:z.uuid(),comment}).strict().parse(request.body);return publish(db,actor,b.revisionId,b.comment);});
 app.post('/v1/ops/withdraw',async request=>{
  const actor=await access(request,['administrator']);const b=z.object({entity:entitySchema,id:z.uuid(),expected:z.number().int().min(0),comment}).strict().parse(request.body);
  return inTransaction(db,async c=>{const row=await record(c,b.entity,b.id,true);if(row.content.admin_revision_seq!==b.expected)throw denied(409);
   await c.query("SELECT set_config('rova.actor_id',$1,true)",[actor.name]);await c.query(`UPDATE ${definitions[b.entity].table} SET ${definitions[b.entity].status}='${b.entity==='hazard'?'rejected':'withdrawn'}' WHERE id=$1`,[b.id]);await actionLog(c,actor.name,'withdraw',b.entity,b.id,{...row.content,status:row.status},{...row.content,status:'withdrawn'},b.comment);return{withdrawn:true};});
 });
 app.get('/v1/ops/freshness',async request=>{
  await access(request);return{rows:(await db.query(`SELECT id,title,kind,reference,source_url,approval_status,published_at,expires_at,
   CASE WHEN expires_at<=now() THEN 'expired' WHEN expires_at IS NULL OR published_at IS NULL THEN 'missing dates' WHEN published_at<now()-interval '180 days' THEN 'needs review' ELSE 'current' END AS freshness
   FROM data_sources ORDER BY expires_at ASC NULLS FIRST,id LIMIT 200`)).rows};
 });
 app.get('/v1/ops/analytics',async request=>{
  await access(request);
  const [hazards,reviewCounts,actions]=await Promise.all([db.query('SELECT incident_type AS category,community_status AS status,count(*)::int AS count FROM incident_reports WHERE community_status IS NOT NULL GROUP BY incident_type,community_status'),db.query('SELECT decision,count(*)::int AS count FROM admin_reviews GROUP BY decision'),db.query('SELECT action,count(*)::int AS count FROM admin_action_logs WHERE created_at>now()-interval \'30 days\' GROUP BY action')]);
  return{hazards:hazards.rows,reviews:reviewCounts.rows,actions:actions.rows,trafficMeasurements:false,scope:'Database moderation counts; not driver journeys or congestion estimates.'};
 });
 app.get('/v1/ops/audit',async request=>{await access(request);const q=z.object({page:z.coerce.number().int().min(1).max(1000).default(1)}).strict().parse(request.query);return{rows:(await db.query('SELECT * FROM admin_action_logs ORDER BY id DESC LIMIT 50 OFFSET $1',[(q.page-1)*50])).rows,page:q.page};});
 app.get('/v1/ops/coverage',async request=>{await access(request);return{enabled:coverageEnabled,scope:'Approximately 5km cells; counts of lookup requests, not people or measured traffic.',rows:(await db.query("SELECT day,cell_lon,cell_lat,reason,samples FROM coverage_daily WHERE day>current_date-30 AND samples>=10 ORDER BY day DESC,samples DESC LIMIT 200")).rows};});
 app.get('/v1/ops/sponsored',async request=>{await access(request);return{...sponsorshipModel,rows:await sponsoredAnalytics(db)};});
 app.get('/v1/ops/members',async request=>{const actor=await access(request,['administrator']);return{rows:(await db.query('SELECT subject,role,active,granted_by,granted_at FROM admin_members WHERE issuer=$1 ORDER BY granted_at',[actor.issuer])).rows};});
 app.post('/v1/ops/member',async request=>{
  const actor=await access(request,['administrator']);const b=z.object({subject:z.uuid(),role:z.enum(['viewer','reviewer','editor','administrator']),active:z.boolean(),comment}).strict().parse(request.body);
  if(!provider?.memberExists||!await provider.memberExists(b.subject))throw denied(400,'Select a user in this Supabase project.');
  return inTransaction(db,async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext('rova.admin-members'))");const prior=(await c.query('SELECT * FROM admin_members WHERE issuer=$1 AND subject=$2 FOR UPDATE',[actor.issuer,b.subject])).rows[0];
   if(prior?.role==='administrator'&&prior.active&&(!b.active||b.role!=='administrator')){const admins=await c.query("SELECT count(*)::int AS n FROM admin_members WHERE issuer=$1 AND role='administrator' AND active",[actor.issuer]);if(admins.rows[0].n<=1)throw denied(409,'The final administrator cannot be removed.');}
   await c.query(`INSERT INTO admin_members(issuer,subject,role,active,granted_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(issuer,subject) DO UPDATE SET role=$3,active=$4,granted_by=$5,granted_at=now()`,[actor.issuer,b.subject,b.role,b.active,actor.name]);
   await actionLog(c,actor.name,'grant_role','member',b.subject,prior??null,{subject:b.subject,role:b.role,active:b.active},b.comment);return{saved:true};});
 });
 return access;
}
