import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import {evaluateSpeedLimit,ghanaSpeedRules,type RoadCandidate,type SafetyFix} from '@rova/shared';
import {registerGhanaRules} from './ghana-rules.js';
const now=Date.parse('2026-11-15T12:00:00Z'),iso=new Date(now-1000).toISOString();
const source={id:'TEST-SOURCE',kind:'official',status:'approved',synthetic:false,reviewedAt:iso,validFrom:iso,expiresAt:null,document:'TEST ONLY classification evidence',url:'https://example.com/test'};
const road:RoadCandidate={id:'TEST ONLY ROAD',distanceMeters:1,roadKind:'road',gradeLevel:0,roadWidthMeters:6,direction:'both',bearing:90,endpointMeters:500,confidence:.99,accuracyMeters:2,status:'published',synthetic:false,validFrom:iso,expiresAt:null,lastReviewedAt:iso,source,rules:[],speedContext:{category:'outside_built_up',reference:'TEST ONLY reviewed boundaries and signage',defaultConfirmed:true,independentApprovals:2,oldestApprovalAt:iso,auditLogId:'TEST-PUBLISH-AUDIT',revisionId:'TEST-REVISION'}};
const fix:SafetyFix={lon:0,lat:0,accuracy:5,heading:90,vehicleType:'private_car',timestamp:now};
test('regulations 211 and 212 combine the applicable road limit and explicit vehicle cap',()=>{
 for(const [category,roadSpeed]of Object.entries(ghanaSpeedRules.roadLimits))for(const [vehicleType,cap]of Object.entries(ghanaSpeedRules.vehicleCaps)){
  const r=evaluateSpeedLimit({...fix,vehicleType:vehicleType as SafetyFix['vehicleType']},[{...road,speedContext:{...road.speedContext!,category:category as 'motorway'}}],now);
  assert.equal(r.status,'verified');if(r.status==='verified'){assert.equal(r.speedLimitKmh,Math.min(roadSpeed,cap));assert.equal(r.generalDefault?.source.url,ghanaSpeedRules.roadSource.url);assert.equal(r.rules.length,0);}
 }
 assert.equal(evaluateSpeedLimit({...fix,vehicleType:'motorcycle'},[road],now).speedLimitKmh,90);
 for(const type of ['heavy_vehicle','commercial_vehicle']as const)assert.equal(evaluateSpeedLimit({...fix,vehicleType:type},[road],now).status,'unknown');
});
test('classification, signage, audit/reviews, ambiguous geometry and expiry cannot be bypassed by national defaults',()=>{
 const invalid=[{...road,speedContext:undefined},{...road,status:'draft'},{...road,roadKind:'ramp'},{...road,endpointMeters:0},
  ...[{category:'unknown'},{defaultConfirmed:false},{reference:null},{independentApprovals:1},{auditLogId:null},{revisionId:null},{oldestApprovalAt:new Date(now-181*86400000).toISOString()}].map(c=>({...road,speedContext:{...road.speedContext!,...c}as RoadCandidate['speedContext']}))];
 for(const candidate of invalid)assert.equal(evaluateSpeedLimit(fix,[candidate],now).status,'unknown');
 assert.equal(evaluateSpeedLimit(fix,[road,{...road,id:'PARALLEL',distanceMeters:5}],now).status,'unknown');
 assert.equal(evaluateSpeedLimit({...fix,timestamp:Date.parse(ghanaSpeedRules.reviewBy)},[road],Date.parse(ghanaSpeedRules.reviewBy)).status,'unknown');
 const sign={id:'TEST SIGN',speedLimitKmh:80,units:'km/h',vehicleClass:'all',direction:'both',role:'road_limit',evidenceType:'posted_signage',legalApplicability:'confirmed',status:'published',synthetic:false,confidence:.99,effectiveFrom:iso,expiresAt:null,lastReviewedAt:iso,revision:1,supersedesId:null,reference:'TEST ONLY sign scope',source,approvals:2,oldestApprovalAt:iso,auditLogId:'TEST-SIGN-AUDIT'};
 assert.equal(evaluateSpeedLimit(fix,[{...road,rules:[sign]}],now).speedLimitKmh,80);
 assert.equal(evaluateSpeedLimit({...fix,vehicleType:'loaded_heavy_vehicle'},[{...road,rules:[sign]}],now).speedLimitKmh,75);
 assert.equal(evaluateSpeedLimit(fix,[{...road,rules:[{...sign,status:'draft'}]}],now).status,'unknown');
 assert.equal(evaluateSpeedLimit(fix,[{...road,rules:[{...sign,effectiveFrom:null}]}],now).status,'unknown');
});
test('public statutory reference has sources and review dates but never claims a current GPS limit or camera coverage',async()=>{
 const app=Fastify();registerGhanaRules(app,()=>now);try{const r=await app.inject('/safety/ghana-rules');assert.equal(r.statusCode,200);assert.equal(r.json().status,'document_verified');assert.equal(r.json().currentLocationLimit,null);assert.deepEqual(r.json().enforcementLocations,[]);}finally{await app.close();}
 const stale=Fastify();registerGhanaRules(stale,()=>Date.parse(ghanaSpeedRules.reviewBy));try{assert.equal((await stale.inject('/safety/ghana-rules')).json().status,'review_due');}finally{await stale.close();}
});
test('a returned proof cannot outlive source or statutory review validity',()=>{
 const r=evaluateSpeedLimit(fix,[{...road,source:{...source,expiresAt:new Date(now+500).toISOString()}}],now);
 assert.equal(r.status,'verified');if(r.status==='verified')assert.equal(r.evidenceValidUntil,now+500);
});
