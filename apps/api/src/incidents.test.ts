import assert from 'node:assert/strict';
import test from 'node:test';
import { approximatePoint, aggregateConfidence, incidentSubmission, expiryHours } from './incidents.js';
import { buildApp } from './app.js';
import { readConfig } from './config.js';
import type { Pool } from 'pg';
test('incident fuzzing stays on a fixed grid and bounds displacement throughout Ghana',()=>{
  for(let lat=4;lat<=12;lat+=0.137)for(let lon=-4;lon<=2;lon+=0.113){
    const a=approximatePoint(lon,lat);assert.deepEqual(approximatePoint(...a),a);
    assert.ok(Math.hypot((a[0]-lon)*111320*Math.cos(lat*Math.PI/180),(a[1]-lat)*111320)<80);
    assert.ok(Math.abs(a[0]*1000-Math.round(a[0]*1000))<1e-8);
  }
  assert.deepEqual(approximatePoint(-.201234,5.612345),[-.201,5.612]);
});
test('validation accepts only bounded hazards, safe interaction, modest notes and GPS accuracy',()=>{
  const b={category:'pothole',interaction:'parked',fix:{lon:-.2,lat:5.6,accuracy:10,timestamp:Date.now()}};
  assert.equal(incidentSubmission.parse(b).category,'pothole');
  for(const change of [{category:'camera'},{interaction:'driver'},{note:'x'.repeat(281)},{fix:{...b.fix,accuracy:51}},{fix:{...b.fix,lon:200}},{deviceId:'spoofed'}])assert.equal(incidentSubmission.safeParse({...b,...change}).success,false);
  assert.equal(aggregateConfidence(0,0),.33);assert.ok(aggregateConfidence(3,0)>aggregateConfidence(0,3));
  for(const expiry of Object.values(expiryHours))assert.ok(expiry>0&&expiry<=24);
});
test('anonymous and moderation endpoints reject missing credentials; production fails closed without stable privacy key',async()=>{
  const db={end:async()=>{},on:()=>{}} as unknown as Pool;
  const app=await buildApp({config:readConfig({NODE_ENV:'test'}),database:db,logger:false});
  try{
    assert.equal((await app.inject('/v1/incidents/nearby?lon=-.2&lat=5.6')).statusCode,401);
    assert.equal((await app.inject('/v1/admin/incidents')).statusCode,503);
  }finally{await app.close();}
  const prod=await buildApp({config:readConfig({NODE_ENV:'production',DATABASE_URL:'postgres://localhost/unused'}),database:db,logger:false});
  try{assert.equal((await prod.inject({method:'POST',url:'/v1/incidents/session',payload:{platform:'android'}})).statusCode,503);}finally{await prod.close();}
});
