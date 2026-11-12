import {transactionalCache,type SlotStorage} from '../offline/cache';
import {networkObservation,networkSnapshot,requestOutcome,setLowData} from '../offline/network';
import {validateSavedRoute} from '../offline/data';
import {offlinePackState,offlineSpeedLimit,validateSafetyPack,type OfflineSafetyPack,type RoadCandidate} from '@rova/shared';
import * as savedData from '../offline/data';
import {offlineCompliance,downloadSafetyPack} from '../offline/runtime';
const now=Date.parse('2026-11-10T12:00:00Z'),past=new Date(now-86400000).toISOString(),future=new Date(now+86400000).toISOString();
const source={id:'test-source',kind:'official',status:'published',synthetic:false,reviewedAt:past,validFrom:past,expiresAt:future,document:'ISOLATED TEST EVIDENCE',url:null};
const road:RoadCandidate={id:'ISOLATED ROAD',distanceMeters:0,roadKind:'road',gradeLevel:0,roadWidthMeters:8,direction:'both',bearing:90,endpointMeters:500,confidence:.99,accuracyMeters:2,status:'published',synthetic:false,validFrom:past,expiresAt:future,lastReviewedAt:past,source,rules:[{id:'ISOLATED RULE',speedLimitKmh:50,units:'km/h',vehicleClass:'all',direction:'both',role:'road_limit',evidenceType:'official_record',legalApplicability:'confirmed',status:'published',synthetic:false,confidence:.99,effectiveFrom:past,expiresAt:future,lastReviewedAt:past,revision:1,supersedesId:null,reference:'TEST ONLY',source,approvals:2,oldestApprovalAt:past,auditLogId:'test-audit'}]};
const pack=():OfflineSafetyPack=>({schema:1,complete:true,version:'sha256:'+'a'.repeat(64),createdAt:now-1000,expiresAt:now+10000,bounds:[-.21,5.59,-.19,5.61],vehicleType:'private_car',attribution:'ISOLATED AUTOMATED TEST',roads:[{geometry:[[-.209,5.6],[-.191,5.6]],record:structuredClone(road)}]});
const fix={lon:-.2,lat:5.6,accuracy:5,heading:90,timestamp:now,vehicleType:'private_car' as const};

test('pilot build cannot restore a numeric limit from an otherwise valid old offline pack',async()=>{const original=process.env.EXPO_PUBLIC_PILOT_MODE,time=jest.spyOn(Date,'now').mockReturnValue(now),saved=savedData.offlineData(),spy=jest.spyOn(savedData,'offlineData').mockReturnValue({...saved,safety:pack()});try{delete process.env.EXPO_PUBLIC_PILOT_MODE;const position={coordinate:[-.2,5.6] as [number,number],accuracy:5,heading:90,timestamp:now,speed:10};expect(offlineCompliance(position,'private_car').limit.status).toBe('verified');process.env.EXPO_PUBLIC_PILOT_MODE='true';expect(offlineCompliance(position,'private_car').limit.status).toBe('unknown');await expect(downloadSafetyPack(-.2,5.6,'private_car')).rejects.toThrow('Pilot safety data');}finally{if(original===undefined)delete process.env.EXPO_PUBLIC_PILOT_MODE;else process.env.EXPO_PUBLIC_PILOT_MODE=original;spy.mockRestore();time.mockRestore();}});
test('fresh preapproved offline limits require same road, heading, GPS, vehicle, dates and complete coverage',()=>{
 expect(offlineSpeedLimit(pack(),fix,now)).toMatchObject({status:'verified',speedLimitKmh:50});
 expect(offlineSpeedLimit(pack(),{...fix,accuracy:60},now).status).toBe('unknown');
 expect(offlineSpeedLimit(pack(),{...fix,heading:0},now).status).toBe('unknown');
 expect(offlineSpeedLimit(pack(),{...fix,vehicleType:'bus'},now).status).toBe('unknown');
 expect(offlineSpeedLimit(pack(),{...fix,lon:-.2099},now).status).toBe('unknown');
 expect(offlineSpeedLimit(pack(),{...fix,lat:5.63},now).status).toBe('unknown');
 const parallel=pack();parallel.roads.push({geometry:[[-.209,5.60005],[-.191,5.60005]],record:{...road,id:'UNREVIEWED RAMP',status:'draft',rules:[]}});
 expect(offlineSpeedLimit(parallel,fix,now)).toMatchObject({status:'unknown',reason:'ambiguous_parallel_roads'});
 const expired=pack();expired.roads[0].record.rules[0].expiresAt=past;expect(offlineSpeedLimit(expired,fix,now).status).toBe('unknown');
 const stale=pack();stale.expiresAt=now;expect(offlinePackState(stale,now)).toBe('stale');expect(offlineSpeedLimit(stale,fix,now).status).toBe('unknown');
 expect(offlinePackState(pack(),now-10000)).toBe('stale');
 expect(()=>validateSafetyPack({...pack(),complete:false})).toThrow();expect(()=>validateSafetyPack({...pack(),schema:2})).toThrow();
});
test('airplane mode and reachability are explicit; request failures do not override the OS offline state',()=>{
 networkObservation({isConnected:false,isInternetReachable:false});expect(networkSnapshot().status).toBe('offline');requestOutcome(true);expect(networkSnapshot().status).toBe('offline');
 networkObservation({isConnected:true,isInternetReachable:true});requestOutcome(false);expect(networkSnapshot().status).toBe('degraded');setLowData(true);expect(networkSnapshot().lowData).toBe(true);requestOutcome(true);expect(networkSnapshot().status).toBe('online');setLowData(false);
});
test('partial, corrupted, cancelled or failed commits retain the previous complete cache',async()=>{
 const values:Record<string,string>={};let pointer:string|null=null;let corrupt=false,failCommit=false;
 const storage:SlotStorage={read:async s=>values[s]??null,write:async(s,v)=>{values[s]=corrupt?v.slice(0,3):v;},pointer:async()=>pointer,commit:async s=>{if(failCommit)throw new Error('interrupted');pointer=s;}};
 const validate=(v:unknown)=>{if(!(v as{complete:boolean})?.complete)throw new Error('partial');return v as{complete:boolean;version:number};};
 const cache=transactionalCache(storage,validate);await cache.write({complete:true,version:1});
 corrupt=true;await expect(cache.write({complete:true,version:2})).rejects.toThrow();expect(await cache.read()).toMatchObject({version:1});
 corrupt=false;failCommit=true;await expect(cache.write({complete:true,version:3})).rejects.toThrow();expect(await cache.read()).toMatchObject({version:1});
 failCommit=false;await cache.write({complete:true,version:4});expect(await cache.read()).toMatchObject({version:4});
 values[pointer!]='broken';expect(await cache.read()).toBeNull();
});
test('saved guidance rejects sample, missing maneuver geometry, overlong lifetime and partial routes',()=>{
 const option={id:'test',label:'TEST',attribution:'Geoapify, TEST ONLY',isSample:false,trafficAware:false,etaKind:'static_estimate',geometry:{type:'LineString',coordinates:[[-.2,5.6],[-.19,5.6]]},distanceMeters:1000,durationSeconds:60,maneuvers:[{instruction:'ISOLATED TEST',geometryIndex:1,distanceMeters:1000,durationSeconds:60}],tolls:'unknown'};
 const r={schema:1,savedAt:now,expiresAt:now+86400000,origin:[-.2,5.6],destination:[-.19,5.6],title:'TEST ONLY',option};
 expect(validateSavedRoute(r).title).toBe('TEST ONLY');expect(()=>validateSavedRoute({...r,option:{...option,isSample:true}})).toThrow();expect(()=>validateSavedRoute({...r,expiresAt:now+86400001})).toThrow();expect(()=>validateSavedRoute({...r,option:{...option,maneuvers:[{instruction:'missing'}]}})).toThrow();
});
