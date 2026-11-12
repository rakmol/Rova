import { z } from 'zod';
import type { Pool,PoolClient } from 'pg';
import type { AdminActor } from './admin-auth.js';
import {denied}from'./admin-auth.js';
const date=z.iso.datetime({offset:true}).nullable();
const coordinate=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const line=z.object({type:z.literal('LineString'),coordinates:z.array(coordinate).min(2).max(20000)}).strict();
const point=z.object({type:z.literal('Point'),coordinates:coordinate}).strict();
const polygon=z.object({type:z.literal('Polygon'),coordinates:z.array(z.array(coordinate).min(4).max(20000)).min(1).max(20)}).strict();
const reference=z.string().trim().min(1).max(1000);
const url=z.url().refine(v=>{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search;},'Use a public HTTPS evidence URL without credentials or query tokens').nullable();
const provenance={source_id:z.uuid().nullable(),source_reference:reference,accuracy_meters:z.number().finite().min(0).max(1000).nullable(),confidence:z.number().min(0).max(1).nullable()};
const validity={valid_from:date,expires_at:date};
export const definitions={
 sponsor:{table:'sponsored_listings',status:'approval_status',schema:z.object({business_name:z.string().trim().min(1).max(120),category:z.enum(['petrol_station','mechanic','tire_shop','car_wash','roadside_service']),description:z.string().trim().min(1).max(280),geometry:z.object({type:z.literal('Point'),coordinates:z.tuple([z.number().finite().min(-4).max(2),z.number().finite().min(4).max(12)])}).strict(),address:z.string().trim().min(1).max(300),region:z.string().trim().min(1).max(100),website:url,contact_phone:z.string().regex(/^[+\d ()-]{7,30}$/),business_evidence_url:url.unwrap(),evidence_reference:reference,sponsor_label:z.literal('Sponsored'),price_plan:z.enum(['proposal_basic','proposal_featured']),valid_from:z.iso.datetime({offset:true}),expires_at:z.iso.datetime({offset:true})}).strict()},
 policy:{table:'policy_announcements',status:'approval_status',schema:z.object({title:z.string().trim().min(1).max(160),body:z.string().trim().min(1).max(2000),source_id:z.uuid(),source_reference:reference,source_url:url.unwrap(),valid_from:z.iso.datetime({offset:true}),expires_at:z.iso.datetime({offset:true})}).strict()},
 source:{table:'data_sources',status:'approval_status',schema:z.object({kind:z.enum(['official','field_audit','provider','user_report','synthetic']),authority:reference,title:reference,reference,source_url:url,license_note:reference,published_at:date,...validity}).strict()},
 road:{table:'road_segments',status:'approval_status',schema:z.object({geometry:line,direction:z.enum(['forward','reverse','both']),road_name:reference,...provenance,...validity,road_kind:z.enum(['road','ramp','service','unknown']),grade_level:z.number().int().min(-10).max(20).nullable(),road_width_meters:z.number().min(1).max(60).nullable()}).strict()},
 rule:{table:'speed_limit_rules',status:'status',schema:z.object({road_segment_id:z.uuid(),vehicle_class:z.enum(['all','private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle']),speed_limit_kmh:z.number().int().min(1).max(200),...provenance,direction:z.enum(['forward','reverse','both']),evidence_reference:reference,source_authority:reference,source_document:reference,source_url:url,source_published_at:date,effective_from:date,expires_at:date,units:z.literal('km/h'),evidence_type:z.enum(['posted_signage','official_record','general_default','unspecified']),legal_applicability:z.enum(['confirmed','unconfirmed']),rule_role:z.enum(['road_limit','vehicle_cap'])}).strict()},
 zone:{table:'enforcement_zones',status:'approval_status',schema:z.object({geometry:polygon,zone_type:z.enum(['camera','checkpoint','restricted_area','other']),description:reference,...provenance,...validity}).strict()},
 hazard:{table:'incident_reports',status:'community_status',schema:z.object({geometry:point,incident_type:z.enum(['pothole','flood','collision','closure','congestion','obstacle']),description:z.string().trim().min(1).max(280),accuracy_meters:z.literal(150),observed_at:z.iso.datetime({offset:true}),expires_at:z.iso.datetime({offset:true})}).strict()},
}as const;
export type Entity=keyof typeof definitions;
export const entitySchema=z.enum(['source','road','rule','zone','hazard','policy','sponsor']);
export type Data=Record<string,unknown>;
type DB=Pool|PoolClient;
export async function record(db:DB,entity:Entity,id:string,lock=false){
 const def=definitions[entity];const result=await db.query(`SELECT admin_content(to_jsonb(t)) AS content,t.${def.status} AS status FROM ${def.table} t WHERE id=$1${lock?' FOR UPDATE':''}`,[id]);
 if(!result.rows[0])throw denied(404);return result.rows[0]as{content:Data;status:string};
}
export function editable(entity:Entity,content:Data){const keys=Object.keys(definitions[entity].schema.shape);return Object.fromEntries(keys.map(key=>[key,content[key]]));}
export async function actionLog(db:DB,actor:string,action:string,entity:string,id:string|null,before:unknown,after:unknown,comment:string){await db.query('INSERT INTO admin_action_logs(actor,action,entity,entity_id,before_json,after_json,comment) VALUES($1,$2,$3,$4,$5,$6,$7)',[actor,action,entity,id,before?JSON.stringify(before):null,after?JSON.stringify(after):null,comment]);}
export async function inTransaction<T>(db:Pool,work:(c:PoolClient)=>Promise<T>){const c=await db.connect();try{await c.query('BEGIN');const value=await work(c);await c.query('COMMIT');return value;}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}}
export async function revise(db:Pool,actor:AdminActor,entity:Entity,id:string|null,expected:number|undefined,data:unknown,comment:string,revertedFrom?:string){
 if(!['editor','administrator'].includes(actor.role))throw denied(403);
 const parsed=definitions[entity].schema.parse(data)as Data;const def=definitions[entity];
 if(entity==='hazard'){const geometry=parsed.geometry as{type:'Point';coordinates:number[]};geometry.coordinates=geometry.coordinates.map(n=>Math.round(n*1000)/1000);}
 const from=parsed.effective_from??parsed.valid_from??parsed.observed_at;const expiry=parsed.expires_at;
 if(from&&expiry&&Date.parse(String(expiry))<=Date.parse(String(from)))throw denied(400,'Expiry must follow the effective date.');
 return inTransaction(db,async c=>{
  await c.query("SELECT set_config('rova.actor_id',$1,true)",[actor.name]);
  const old=id?await record(c,entity,id,true):null;
  if(old&&old.content.admin_revision_seq!==expected)throw denied(409,'Record changed. Reload it before editing.');
  const sequence=Number(old?.content.admin_revision_seq??0)+1;
  const keys=Object.keys(parsed);const values=keys.map(k=>k==='geometry'?JSON.stringify(parsed[k]):parsed[k]);
  const expression=(key:string,index:number)=>key==='geometry'?`ST_SetSRID(ST_GeomFromGeoJSON($${index}),4326)`:`$${index}`;
  if(id){
   values.push(id);await c.query(`UPDATE ${def.table} SET ${keys.map((key,i)=>`${key}=${expression(key,i+1)}`).join(',')},${def.status}='${entity==='hazard'?'pending':'pending_review'}',admin_revision_seq=${sequence}${entity==='hazard'?'':',approved_by=NULL,approved_at=NULL'} WHERE id=$${values.length}`,values);
  }else{
   values.push(actor.name);const columns=[...keys,'created_by','admin_revision_seq',def.status];const expr=[...keys.map((key,i)=>expression(key,i+1)),`$${values.length}`,String(sequence),`'${entity==='hazard'?'pending':'pending_review'}'`];
   const inserted=await c.query(`INSERT INTO ${def.table}(${columns.join(',')}) VALUES(${expr.join(',')}) RETURNING id`,values);id=inserted.rows[0].id;
  }
  const current=await record(c,entity,id!);
  const revision=await c.query(`INSERT INTO admin_revisions(entity,entity_id,sequence,author,before_json,after_json,effective_at,expires_at,comment,reverted_from)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,[entity,id,sequence,actor.name,old?JSON.stringify(old.content):null,JSON.stringify(current.content),from??null,expiry??null,comment,revertedFrom??null]);
  await actionLog(c,actor.name,revertedFrom?'revert':'revise',entity,id,old?.content,current.content,comment);
  return{id,revisionId:revision.rows[0].id,sequence,status:current.status};
 });
}
export async function review(db:Pool,actor:AdminActor,revisionId:string,decision:'approve'|'reject',comment:string){
 if(!['reviewer','administrator'].includes(actor.role))throw denied(403);
 return inTransaction(db,async c=>{
  const entry=(await c.query('SELECT * FROM admin_revisions WHERE id=$1',[revisionId])).rows[0];if(!entry)throw denied(404);
  const current=await record(c,entry.entity,entry.entity_id,true);
  if(current.content.admin_revision_seq!==entry.sequence||JSON.stringify(current.content)!==JSON.stringify(entry.after_json))throw denied(409,'This revision is no longer current.');
  if(actor.name===entry.author||actor.name===current.content.created_by)throw denied(403,'Independent review required.');
  await c.query("SELECT set_config('rova.actor_id',$1,true)",[actor.name]);
  const prior=await c.query('SELECT id FROM admin_reviews WHERE revision_id=$1 AND reviewer=$2',[revisionId,actor.name]);if(prior.rowCount)throw denied(409,'Review already recorded.');
  await c.query('INSERT INTO admin_reviews(revision_id,reviewer,decision,comment) VALUES($1,$2,$3,$4)',[revisionId,actor.name,decision,comment]);
  if(entry.entity==='rule')await c.query(`INSERT INTO speed_rule_approvals(speed_rule_id,reviewer_id,decision,reason,rule_revision) VALUES($1,$2,$3,$4,$5) ON CONFLICT(speed_rule_id,reviewer_id,rule_revision) DO UPDATE SET decision=EXCLUDED.decision,reason=EXCLUDED.reason`,[entry.entity_id,actor.name,decision,comment,current.content.revision]);
  await actionLog(c,actor.name,decision,entry.entity,entry.entity_id,null,{revisionId},comment);return{recorded:true};
 });
}
async function assertProvenance(db:DB,data:Data,entity:Entity){
 const from=data.effective_from??data.valid_from??data.observed_at;
 if(!from||!data.expires_at||Date.parse(String(data.expires_at))<=Date.now()||Date.parse(String(from))>=Date.parse(String(data.expires_at)))throw denied(400,'Effective and expiry dates are required.');
 if(data.is_synthetic)throw denied(400,'Synthetic records cannot be published.');
 if(entity==='hazard')return;
 if(entity==='source'){
  if(!['official','field_audit'].includes(String(data.kind))||!data.source_url||!data.published_at||Date.parse(String(data.published_at))>Date.now())throw denied(400,'Documented real evidence is required.');return;
 }
 if(entity==='policy'){
  const source=(await db.query("SELECT * FROM data_sources WHERE id=$1 AND kind='official' AND NOT is_synthetic AND approval_status IN ('approved','published') AND valid_from<=now() AND expires_at>now() AND approved_at>now()-interval '180 days'",[data.source_id])).rows[0];
  if(!source?.source_url||new URL(String(data.source_url)).hostname!==new URL(source.source_url).hostname)throw denied(400,'Policy announcements require a current official source and evidence on its domain.');
  return;
 }
 if(!data.source_id||!data.source_reference||typeof data.confidence!=='number'||data.confidence<(entity==='zone'?.95:.9)||typeof data.accuracy_meters!=='number'||data.accuracy_meters>10)throw denied(400,'Verified provenance, confidence and accuracy are required.');
 const src=(await db.query(`SELECT * FROM data_sources WHERE id=$1 AND approval_status IN ('approved','published') AND NOT is_synthetic AND valid_from<=now() AND expires_at>now()`,[data.source_id])).rows[0];
 if(!src||!['official','field_audit'].includes(src.kind))throw denied(400,'Approve a current source first.');
 if(entity==='road'&&(data.road_kind==='unknown'||!data.road_width_meters))throw denied(400,'Road classification and width are required.');
 if(entity==='zone'&&src.kind!=='official')throw denied(400,'Enforcement zones require official evidence.');
 if(entity==='rule'){
  if(data.legal_applicability!=='confirmed'||data.evidence_type==='unspecified'||(data.evidence_type!=='posted_signage'&&src.kind!=='official'))throw denied(400,'Confirm evidence and legal applicability.');
  const road=(await db.query("SELECT id FROM published_road_segments WHERE id=$1",[data.road_segment_id])).rows[0];if(!road)throw denied(400,'Publish the reviewed road first.');
 }
}
export async function publish(db:Pool,actor:AdminActor,revisionId:string,comment:string){
 if(actor.role!=='administrator')throw denied(403);
 return inTransaction(db,async c=>{
  const entry=(await c.query('SELECT * FROM admin_revisions WHERE id=$1',[revisionId])).rows[0];if(!entry)throw denied(404);
  const entity=entry.entity as Entity;const current=await record(c,entity,entry.entity_id,true);
  if(entity==='sponsor')throw denied(409,'Sponsorship publication is locked until core navigation and launch reviews are complete. Draft reviews never enable ads.');
  if(current.content.admin_revision_seq!==entry.sequence||JSON.stringify(current.content)!==JSON.stringify(entry.after_json))throw denied(409,'Review the current revision.');
  const votes=await c.query("SELECT reviewer,decision FROM admin_reviews WHERE revision_id=$1 AND created_at>now()-interval '180 days'",[revisionId]);
  if(votes.rows.some(v=>v.decision==='reject')||new Set(votes.rows.filter(v=>v.decision==='approve'&&v.reviewer!==entry.author&&v.reviewer!==current.content.created_by).map(v=>v.reviewer)).size<(entity==='hazard'?1:2))throw denied(409,'Independent approvals are missing or a reviewer rejected this revision.');
  await assertProvenance(c,current.content,entity);
  await c.query("SELECT set_config('rova.actor_id',$1,true)",[actor.name]);
  const approver=votes.rows.filter(v=>v.decision==='approve').at(-1)!.reviewer;
  const metadata=entity==='hazard'?'':`,approved_by=$2,approved_at=now()${['road','rule'].includes(entity)?',last_reviewed_at=now()':''}${entity==='rule'?',verified_by=$2,verified_at=now()':''}`;
  await c.query(`UPDATE ${definitions[entity].table} SET ${definitions[entity].status}='${entity==='hazard'?'verified':'published'}'${metadata} WHERE id=$1`,entity==='hazard'?[entry.entity_id]:[entry.entity_id,approver]);
  await actionLog(c,actor.name,'publish',entity,entry.entity_id,{...current.content,status:current.status},{...current.content,status:entity==='hazard'?'verified':'published'},comment);
  return{published:true};
 });
}
