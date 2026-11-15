import assert from 'node:assert/strict';
import {Pool,type Client} from 'pg';
import {revise,review,publish} from './admin-records.js';
import type {AdminActor} from './admin-auth.js';
import {evaluateSpeedLimit,type RoadCandidate} from '@rova/shared';
export async function checkStatutoryRoadContext(client:Client,connectionString:string){
 const pool=new Pool({connectionString}),iso=new Date(Date.now()-60000).toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
 const actor=(name:string,role:AdminActor['role']):AdminActor=>({name:'ISOLATED-'+name,role,issuer:'https://test.invalid',subject:'30000000-0000-4000-8000-000000000001',aal:'aal1',expiresAt:Date.now()+600000,token:'ISOLATED TEST ONLY'});
 const author=actor('author','editor'),a=actor('reviewer-a','reviewer'),b=actor('reviewer-b','reviewer'),admin=actor('publisher','administrator');
 try{
  const source=(await client.query("INSERT INTO data_sources(kind,authority,title,reference,source_url,created_by,approval_status,approved_by,approved_at,valid_from,expires_at) VALUES('official','ISOLATED FIXTURE','TEST ONLY','TEST-STATUTORY-CLASSIFICATION','https://example.com/test','test-author','approved','test-reviewer',now(),$1,$2) RETURNING id",[iso,expiry])).rows[0].id;
  const fields={geometry:{type:'LineString',coordinates:[[-.5,6],[-.49,6]]},direction:'both',road_name:'TEST ONLY - never real geometry',source_id:source,source_reference:'TEST ONLY mapped classification',accuracy_meters:2,confidence:.99,valid_from:iso,expires_at:expiry,road_kind:'road',grade_level:0,road_width_meters:6,speed_context:'motorway',speed_context_reference:'TEST ONLY classified section, boundaries and no signed exception',default_conditions_confirmed:true};
  const draft=await revise(pool,author,'road',null,undefined,fields,'TEST ONLY source and classification review');
  const get=async(vehicle='private_car')=>{const r=await client.query('SELECT c FROM rova_speed_limit_candidates(-.495,6,100,$1) c',[vehicle]);return r.rows.map(r=>r.c) as RoadCandidate[];};
  const check=async(vehicle='private_car')=>evaluateSpeedLimit({lon:-.495,lat:6,heading:90,accuracy:5,timestamp:Date.now(),vehicleType:vehicle as 'private_car'},await get(vehicle),Date.now());
  assert.equal((await check()).status,'unknown');await review(pool,a,draft.revisionId,'approve','TEST ONLY independent classification review');
  await assert.rejects(publish(pool,admin,draft.revisionId,'TEST ONLY single reviewer must fail'));
  await review(pool,b,draft.revisionId,'approve','TEST ONLY second independent classification review');await publish(pool,admin,draft.revisionId,'TEST ONLY publish reviewed fixture');
  assert.equal((await get())[0].speedContext?.independentApprovals,2);assert.ok((await get())[0].speedContext?.revisionId);assert.ok((await get())[0].speedContext?.auditLogId);
  assert.equal((await check()).speedLimitKmh,100);assert.equal((await check('taxi')).speedLimitKmh,80);assert.equal((await check('loaded_heavy_vehicle')).speedLimitKmh,75);assert.equal((await check('unloaded_heavy_vehicle')).speedLimitKmh,80);assert.equal((await check('agricultural_vehicle')).speedLimitKmh,30);assert.equal((await check('heavy_vehicle')).status,'unknown');
  await assert.rejects(client.query("UPDATE road_segments SET speed_context='built_up' WHERE id=$1",[draft.id]));
  const next=await revise(pool,author,'road',draft.id,draft.sequence,{...fields,speed_context:'built_up'},'TEST ONLY change invalidates prior classification reviews');assert.equal(next.status,'pending_review');assert.equal((await check()).status,'unknown');
 }finally{await pool.end();}
}
