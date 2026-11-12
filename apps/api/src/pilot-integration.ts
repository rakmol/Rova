// Invoked only by db.integration.test.ts against its guarded disposable database.
import assert from 'node:assert/strict';
import type {Client} from 'pg';
import type {FastifyInstance} from 'fastify';
export async function checkPilotTelemetry(app:FastifyInstance,db:Client){
 const post=(url:string,payload:unknown,token?:string)=>app.inject({method:'POST',url:'/v1/pilot/'+url,payload:JSON.stringify(payload),headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})}});
 assert.equal((await post('telemetry/session',{consent:false,consentVersion:1})).statusCode,400);
 const response=await post('telemetry/session',{consent:true,consentVersion:1});assert.equal(response.statusCode,201,response.body);const token=response.json().token;
 const batch={batchId:'90000000-0000-4000-8000-000000000001',day:new Date().toISOString().slice(0,10),version:'0.1.0',build:'8',variant:'preview',counts:{sessions:1,nav_attempts:1,gps_good:2}};
 assert.equal((await post('telemetry/batches',{...batch,coordinates:[0,0]},token)).statusCode,400);
 assert.equal((await post('telemetry/batches',batch)).statusCode,401);
 const results=await Promise.all(Array.from({length:6},()=>post('telemetry/batches',batch,token)));assert.ok(results.every(r=>r.statusCode===200));assert.equal(results.filter(r=>!r.json().duplicate).length,1);
 const stored=(await db.query('SELECT counts FROM pilot_telemetry_batches WHERE batch_id=$1',[batch.batchId])).rows;assert.equal(stored.length,1);assert.deepEqual(stored[0].counts,batch.counts);
 await assert.rejects(db.query("INSERT INTO pilot_telemetry_batches SELECT token_hash,'90000000-0000-4000-8000-000000000002',day,received_day,app_version,build_code,variant,'{\"longitude\":1}'::jsonb FROM pilot_telemetry_batches WHERE batch_id=$1",[batch.batchId]));
 const race=await Promise.all([post('telemetry/batches',{...batch,batchId:'90000000-0000-4000-8000-000000000003'},token),post('telemetry/erase',{},token)]);assert.equal(race[1].statusCode,200);assert.equal((await db.query('SELECT count(*)::int AS n FROM pilot_telemetry_batches')).rows[0].n,0);assert.equal((await post('telemetry/batches',batch,token)).statusCode,401);assert.equal((await post('telemetry/erase',{},token)).statusCode,200);
 return token;
}
export async function checkPilotCorridor(app:FastifyInstance,db:Client,headers:Record<string,{authorization:string}>,roadId:string,sourceId:string){
 const send=(who:string,path:string,payload:unknown)=>app.inject({method:'POST',url:'/v1/ops/pilot/'+path,payload:JSON.stringify(payload),headers:{...headers[who],'content-type':'application/json'}});
 const lookup=()=>app.inject(`/safety/speed-limit?lat=5.8&lon=-0.315&heading=90&accuracy=5&timestamp=${Date.now()}&vehicleType=private_car`);
 assert.equal((await lookup()).json().reason,'pilot_corridor_unavailable');assert.equal((await app.inject('/safety/offline-pack?lon=-.315&lat=5.8&vehicleType=private_car')).statusCode,503);
 const draft={name:'ISOLATED PILOT TEST, NOT A REAL CORRIDOR',segmentIds:[roadId],evidence:'ISOLATED INDEPENDENT TEST EVIDENCE',stage:'passenger',validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),comment:'ISOLATED pilot test creation'};
 assert.equal((await send('viewer','corridors',draft)).statusCode,403);const created=await send('editor','corridors',draft);assert.equal(created.statusCode,200,created.body);const id=created.json().id,revision=1;
 const control=(action:string)=>send('administrator','control',{id,revision,action,comment:'ISOLATED pilot test operation'});
 assert.equal((await control('activate')).statusCode,409);assert.equal((await send('editor','review',{id,revision,decision:'approve',comment:'ISOLATED author cannot review'})).statusCode,403);
 await assert.rejects(db.query("INSERT INTO pilot_corridor_reviews(corridor_id,revision,reviewer,decision,comment) SELECT id,revision,author,'approve','ISOLATED self review blocked' FROM pilot_corridors WHERE id=$1",[id]));
 for(const who of ['reviewer','reviewer2']){const reviewed=await send(who,'review',{id,revision,decision:'approve',comment:'ISOLATED independent pilot review'});assert.equal(reviewed.statusCode,200,reviewed.body);}
 const active=await control('activate');assert.equal(active.statusCode,200,active.body);assert.equal((await lookup()).json().speedLimitKmh,40);
 const context=await app.inject({method:'POST',url:'/safety/alert-context',payload:{fix:{lat:5.8,lon:-.315,heading:90,accuracy:5,timestamp:Date.now(),vehicleType:'private_car'},path:[[-.315,5.8],[-.31,5.8]]}});assert.equal(context.statusCode,200,context.body);assert.equal(context.json().limit.status,'verified');assert.ok(!context.json().reportedRoads?.length);
 await db.query("UPDATE data_sources SET approval_status='withdrawn' WHERE id=$1",[sourceId]);assert.equal((await lookup()).json().status,'unknown');await db.query("UPDATE data_sources SET approval_status='published' WHERE id=$1",[sourceId]);
 assert.equal((await control('pause')).statusCode,200);assert.equal((await lookup()).json().status,'unknown');assert.equal((await control('activate')).statusCode,200);
 const edit=await send('editor','corridors',{...draft,id,expected:1,name:'ISOLATED REVISED PILOT TEST'});assert.equal(edit.statusCode,200,edit.body);assert.equal(edit.json().revision,2);assert.equal(edit.json().status,'draft');assert.equal((await lookup()).json().status,'unknown');assert.equal((await control('activate')).statusCode,409);
 const dashboard=await app.inject({url:'/v1/ops/pilot',headers:headers.viewer});assert.equal(dashboard.statusCode,200,dashboard.body);assert.equal(dashboard.json().actualSpend,null);assert.equal(dashboard.json().incidentPrecision.percent,null);
}
export async function checkPilotIncident(app:FastifyInstance,db:Client,headers:Record<string,{authorization:string}>,reportId:string){
 const revision=(await db.query('SELECT revision FROM incident_reports WHERE id=$1',[reportId])).rows[0].revision;
 const send=(who:string,judgment:string,rev=revision)=>app.inject({method:'POST',url:'/v1/ops/pilot/incident-check',headers:headers[who],payload:{reportId,revision:rev,judgment,evidence:'ISOLATED timely parked observer evidence'}});
 const snapshot=async()=>(await app.inject({url:'/v1/ops/pilot',headers:headers.viewer})).json();
 assert.equal((await send('viewer','confirmed')).statusCode,403);assert.equal((await send('reviewer','confirmed')).statusCode,200);assert.equal((await snapshot()).incidentPrecision.pending,1);
 assert.equal((await send('reviewer2','false')).statusCode,200);assert.equal((await snapshot()).incidentPrecision.conflicting,1);assert.equal((await snapshot()).incidentPrecision.assessed,0);assert.equal((await send('reviewer','confirmed')).statusCode,409);
 await assert.rejects(db.query("UPDATE pilot_incident_checks SET judgment='confirmed' WHERE report_id=$1",[reportId]));
 await db.query('UPDATE incident_reports SET confidence=.6,revision=revision+1 WHERE id=$1',[reportId]);assert.equal((await send('reviewer','confirmed',revision+1)).statusCode,200);assert.equal((await snapshot()).incidentPrecision.pending,1);assert.equal((await snapshot()).incidentPrecision.conflicting,0);
 assert.equal((await send('reviewer2','confirmed',revision+1)).statusCode,200);const precision=(await snapshot()).incidentPrecision;assert.equal(precision.assessed,1);assert.equal(precision.percent,null);
 const token='f'.repeat(64);await db.query("INSERT INTO pilot_telemetry_sessions(token_hash,consent_version,expires_at) VALUES($1,1,now()+interval '1 day')",[token]);await db.query("INSERT INTO pilot_telemetry_batches(token_hash,batch_id,day,app_version,build_code,variant,counts) VALUES($1,gen_random_uuid(),current_date,'0.1.0','99','preview','{\"sessions\":20}')",[token]);const group=(await snapshot()).groups.find((g:{build:string})=>g.build==='99');assert.equal(group.suppressed,true);assert.equal(group.counts,undefined);await db.query('DELETE FROM pilot_telemetry_sessions WHERE token_hash=$1',[token]);
}
