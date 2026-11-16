import assert from 'node:assert/strict';
import test from 'node:test';
import type {Pool} from 'pg';
import type {ComplianceCoordinate} from '@rova/shared';
import {course} from './compliance-geometry.js';
import {reportedSpeedData} from './reported-speed-data.js';
import {reportedSpeedLimit} from './reported-speed.js';
import {buildApp} from './app.js';
import {readConfig} from './config.js';
const now=Date.parse('2026-11-16T12:00:00Z');
function sample(name:string){
 const part=reportedSpeedData.parts.find(p=>p.roadName===name&&p.coordinates.length>5)!;
 const a=part.coordinates[0],b=part.coordinates[1];
 const point:ComplianceCoordinate=[(a[0]+b[0])/2,(a[1]+b[1])/2];
 const path=part.coordinates.map(p=>[p[0],p[1]] as ComplianceCoordinate);
 return {fix:{lon:point[0],lat:point[1],accuracy:5,heading:course([...a],[...b]),timestamp:now,vehicleType:'private_car' as const},path};
}
test('N1 and N4 reports match their mapped traversal in either travel direction without legal verification',()=>{
 for(const name of ['George Walker Bush Highway','J.J. Rawlings Avenue']){
  const {fix,path}=sample(name);const result=reportedSpeedLimit(fix,path,now);
  assert.equal(result?.speedLimitKmh,80);assert.equal(result?.verification,'reported');assert.match(result!.sourceReference,/owner report/);
  assert.equal(reportedSpeedLimit({...fix,heading:(fix.heading+180)%360},[...path].reverse(),now)?.speedLimitKmh,80);
 }
});
test('no report off the corridor, on nearby parallel streets, crossing streets, after expiry or with poor GPS',()=>{
 const {fix,path}=sample('George Walker Bush Highway');
 for(const moved of [{...fix,lat:fix.lat+.0004},{...fix,accuracy:60},{...fix,timestamp:now-4000},{...fix,heading:(fix.heading+90)%360},{...fix,lon:-.29}])assert.equal(reportedSpeedLimit(moved,path,now),null);
 assert.equal(reportedSpeedLimit(fix,path,Date.parse(reportedSpeedData.expiresAt)),null);
 assert.equal(reportedSpeedLimit(fix,path,Date.parse(reportedSpeedData.reportedAt)-1),null);
});
test('HTTP delivers the display report separately while the verified legal limit stays unknown',async t=>{
 t.mock.method(Date,'now',()=>now);
 const db={query:async()=>({rows:[]}),on:()=>{},end:async()=>{}} as unknown as Pool;
 const app=await buildApp({config:readConfig({NODE_ENV:'test',LOG_LEVEL:'silent'}),database:db,logger:false});
 try{
  const payload=sample('George Walker Bush Highway');
  const response=await app.inject({method:'POST',url:'/safety/alert-context',payload});
  assert.equal(response.statusCode,200,response.body);assert.equal(response.json().limit.status,'unknown');assert.equal(response.json().reportedSpeedLimit.speedLimitKmh,80);assert.equal(response.json().notices.length,0);
 }finally{await app.close();}
});
