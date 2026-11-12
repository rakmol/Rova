import assert from'node:assert/strict';import test from'node:test';import type{Pool}from'pg';
import{roadAssociations,roadKey}from'./reported-road-import.js';import{reportedRoadNotices,type ReportedRoadCandidate}from'./reported-roads.js';import{buildApp}from'./app.js';import{readConfig}from'./config.js';
const candidate:ReportedRoadCandidate={id:'DEMO-ROAD',roadName:'TEST ROAD',sourceUrl:'https://example.com/test-report',reportedAt:'2026-11-08',geometry:{coordinates:[[.002,0],[.005,0]]}};
const path:[number,number][]=[[0,0],[.006,0]];
test('road traversal notices are unverified and route-relative; parallel, crossing, behind and short roads do not warn',()=>{
 const results=reportedRoadNotices([candidate],path,0);assert.equal(results.length,1);assert.equal(results[0].verification,'unverified');assert.equal(results[0].scope,'named_road_not_camera');assert.ok(results[0].distanceMeters>200);assert.ok(!('speedLimitKmh'in results[0]));
 for(const coordinates of [[[.002,.0004],[.005,.0004]],[[.003,-.003],[.003,.003]],[[-.004,0],[-.001,0]],[[.002,0],[.0021,0]]]as[number,number][][])assert.equal(reportedRoadNotices([{...candidate,geometry:{coordinates}}],path,0).length,0);
 assert.equal(reportedRoadNotices(Array.from({length:257},()=>candidate),path,0).length,0);
});
test('adjacent way pieces form a road traversal; reverse geometry order is not an invented camera-facing direction',()=>{
 const parts=[{...candidate,geometry:{coordinates:[[.002,0],[.0022,0]]as[number,number][]}},{...candidate,geometry:{coordinates:[[.0022,0],[.005,0]]as[number,number][]}}];
 assert.equal(reportedRoadNotices(parts,path,0).length,1);
 assert.equal(reportedRoadNotices([{...candidate,geometry:{coordinates:[...candidate.geometry.coordinates].reverse()}}],path,0).length,1);
});
test('road associations use exact normalised names and city bounds, grouping point reports without creating camera pins',()=>{
 const base={city:'accra'as const,sourceUrl:'https://example.com/report',publishedAt:'2026-11-01',sourceUpdatedAt:null};
 const reports=[{...base,id:'1',area:'Winneba Road / Mendskrom'},{...base,id:'2',area:'Winneba Road / SCC'},{...base,id:'3',area:'Kasoa'},{...base,id:'4',area:'Winneba Highway'}];
 const rows=[{id:'inside',name:'WINNEBA ROAD',coordinates:[[-.2,5.6],[-.19,5.6]]as[number,number][]},{id:'wrong-city',name:'Winneba Road',coordinates:[[-1.6,6.7],[-1.59,6.7]]as[number,number][]}];
 const result=roadAssociations(reports,rows);assert.equal(result.advisories.length,1);assert.deepEqual(result.advisories[0].reportIds,['1','2']);assert.deepEqual(result.advisories[0].candidateIds,['inside']);assert.deepEqual(result.unmapped,['3','4']);assert.equal(roadKey('Haatso–Atomic Road'),roadKey('Haatso-Atomic Road'));
});
test('HTTP returns reported road notices even when no verified legal limit exists, and respects the feature flag',async()=>{
 const db={query:async(sql:string)=>({rows:sql.includes('rova_reported_road_candidates')?[{candidate}]:[]}),on:()=>{},end:async()=>{}}as unknown as Pool;
 const config=readConfig({NODE_ENV:'test',LOG_LEVEL:'silent'});const payload=()=>({fix:{lat:0,lon:0,heading:90,accuracy:5,timestamp:Date.now(),vehicleType:'private_car'},path});
 const app=await buildApp({config,database:db,logger:false});try{const r=await app.inject({method:'POST',url:'/safety/alert-context',payload:payload()});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().limit.status,'unknown');assert.equal(r.json().reportedRoads.notices[0].roadName,'TEST ROAD');assert.equal(r.json().notices.length,0);}finally{await app.close();}
 const disabled=await buildApp({config:{...config,REPORTED_ROAD_ALERTS_ENABLED:'false'},database:db,logger:false});try{const r=await disabled.inject({method:'POST',url:'/safety/alert-context',payload:payload()});assert.equal(r.json().reportedRoads.status,'disabled');assert.equal(r.json().reportedRoads.notices.length,0);}finally{await disabled.close();}
});
