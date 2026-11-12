import {createHash} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {Pool} from 'pg';
import {z} from 'zod';
import {ruleProblem,evaluateSpeedLimit,OFFLINE_SAFETY_TTL,validateSafetyPack,type OfflineSafetyPack,type RoadCandidate} from '@rova/shared';
import type {ApiConfig} from './config.js';
export function registerOfflineSafety(app:FastifyInstance,db:Pool,config:ApiConfig){
 const licensed=new Set(config.OFFLINE_SAFETY_SOURCE_IDS.split(',').filter(Boolean));
 app.get('/safety/offline-pack',{config:{rateLimit:{max:6,timeWindow:60000}}},async(request,reply)=>{
  if(config.OFFLINE_SAFETY_ENABLED!=='true'||!licensed.size)return reply.code(503).send({error:'No preapproved offline safety dataset is available.'});
  const q=z.object({lon:z.coerce.number().finite().min(-3.98).max(1.98),lat:z.coerce.number().finite().min(4.02).max(11.98),vehicleType:z.enum(['private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle'])}).strict().parse(request.query);
  const now=Date.now(),bounds:[number,number,number,number]=[q.lon-.01,q.lat-.01,q.lon+.01,q.lat+.01];
  // All physical candidates are retained, including unapproved parallel roads/ramps.
  // Their numeric rules are excluded unless the complete road evidence passes serving checks.
  const rows=await db.query<{geometry:[number,number][];record:RoadCandidate}>(`WITH roads AS (
   SELECT r.id,r.geometry,ST_LineInterpolatePoint(r.geometry,.5) AS midpoint FROM road_segments r LEFT JOIN data_sources s ON s.id=r.source_id
   WHERE NOT r.is_synthetic AND NOT coalesce(s.is_synthetic,false) AND r.geometry && ST_MakeEnvelope($1,$2,$3,$4,4326) ORDER BY r.id LIMIT 65
  ) SELECT (ST_AsGeoJSON(r.geometry)::jsonb)->'coordinates' AS geometry,
   (SELECT c FROM rova_speed_limit_candidates(ST_X(r.midpoint),ST_Y(r.midpoint),100,$5) c WHERE c->>'id'=r.id::text) AS record FROM roads r`,[...bounds,q.vehicleType]);
  if(rows.rows.length>64||rows.rows.some(r=>!r.record))return reply.code(503).send({error:'Area is too complex for a complete offline download. Use online safety lookup.'});
  const roads=rows.rows.map(({geometry,record:r})=>{
   const permitted=!!r.source&&licensed.has(r.source.id)&&r.rules.length>0&&r.rules.length<17&&r.rules.every(v=>v.status==='published'&&v.source&&licensed.has(v.source.id)&&ruleProblem(v,now)===null&&v.effectiveFrom!==null&&Date.parse(v.effectiveFrom)<=now&&v.expiresAt!==null&&Date.parse(v.expiresAt)>now);
   const checked=permitted?evaluateSpeedLimit({lon:q.lon,lat:q.lat,accuracy:1,heading:r.bearing??0,timestamp:now,vehicleType:q.vehicleType},[{...r,distanceMeters:0,endpointMeters:1000}],now):null;
   // URLs might contain source credentials; offline attribution uses document references only.
   const source=r.source?{...r.source,url:null}:null;
   const record={...r,source,rules:checked?.status==='verified'?r.rules.map(v=>({...v,source:v.source?{...v.source,url:null}:null})):[],status:checked?.status==='verified'?r.status:'draft'};
   return{geometry,record};
  });
  const content={schema:1 as const,complete:true as const,createdAt:now,expiresAt:now+OFFLINE_SAFETY_TTL,bounds,vehicleType:q.vehicleType,roads,attribution:'ROVA preapproved source evidence. Road signs take priority. Offline revocations may be delayed up to six hours.'};
  const pack:OfflineSafetyPack={...content,version:'sha256:'+createHash('sha256').update(JSON.stringify(content)).digest('hex')};
  try{validateSafetyPack(pack);}catch{return reply.code(503).send({error:'A complete bounded offline dataset is unavailable.'});}
  if(Buffer.byteLength(JSON.stringify(pack))>2*1024*1024)return reply.code(503).send({error:'Offline dataset exceeds the download limit.'});
  return pack;
 });
}
