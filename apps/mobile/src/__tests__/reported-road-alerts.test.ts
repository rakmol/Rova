import type{ComplianceContext,ReportedRoadNotice}from'@rova/shared';import{ReportedRoadAlertEngine}from'../navigation/reported-road-alerts';
const epoch=Date.parse('2026-11-08T00:00:00Z');
const notice:ReportedRoadNotice={id:'test-road',roadName:'DEMO ROAD',verification:'unverified',scope:'named_road_not_camera',distanceMeters:250,exitDistanceMeters:450,sourceUrl:'https://example.com/report',reportedAt:'2026-11-08'};
function input(second:number){const now=epoch+1000*second;const data:ComplianceContext={fixTimestamp:now,checkedAt:now,validUntil:now,coordinate:[0,0],validForMeters:0,limit:{status:'unknown',speedLimitKmh:null,reason:'no_road_match'},notices:[],enforcementStatus:'unavailable/unverified',reportedRoads:{status:'available',validUntil:now+5000,notices:[notice]}};return{context:{data,progressMeters:0,heading:90},fix:{coordinate:[0,0]as[number,number],accuracy:5,heading:90,timestamp:now,speed:10},progressMeters:0,reliable:true,navigating:true,enabled:true,now};}
test('an unverified approaching-road prompt works without a verified speed limit and requires two distinct GPS fixes',()=>{
 const engine=new ReportedRoadAlertEngine();expect(engine.update(input(0)).alert).toBeNull();expect(engine.update(input(0)).alert).toBeNull();const result=engine.update(input(1));expect(result.alert?.text).toBe('Reported enforcement area ahead. Unverified. Follow posted speed limits.');expect(result.nearby?.roadName).toBe('DEMO ROAD');expect(result.alert?.text).not.toMatch(/80|camera ahead/i);
 expect(engine.update(input(100)).alert).toBeNull();
});
test('bad GPS, stale context, pauses, opt-out and passed roads cannot emit a reported-road prompt',()=>{
 for(const change of [(v:ReturnType<typeof input>)=>({...v,reliable:false}),(v:ReturnType<typeof input>)=>({...v,navigating:false}),(v:ReturnType<typeof input>)=>({...v,enabled:false}),(v:ReturnType<typeof input>)=>({...v,fix:{...v.fix,accuracy:100}}),(v:ReturnType<typeof input>)=>({...v,progressMeters:150})]){
 const e=new ReportedRoadAlertEngine();e.update(input(0));expect(e.update(change(input(1))).alert).toBeNull();expect(e.update(input(2)).alert).toBeNull();}
 const e=new ReportedRoadAlertEngine();e.update(input(0));const expired=input(1);expired.context.data.reportedRoads!.validUntil=expired.now;expect(e.update(expired).nearby).toBeNull();
 const passed=input(2);passed.context.data.reportedRoads!.notices=[{...notice,distanceMeters:0,exitDistanceMeters:-20}];expect(e.update(passed).alert).toBeNull();
});
test('reported-road speech yields to turns and verified alerts, deduplicates, and throttles successive roads',()=>{
 const engine=new ReportedRoadAlertEngine();engine.update(input(0));expect(engine.update({...input(1),suppressPrompt:true}).alert).toBeNull();expect(engine.update(input(2)).alert?.id).toBe('test-road');
 const other=input(3);other.context.data.reportedRoads!.notices=[{...notice,id:'other'}];engine.update(other);other.fix.timestamp+=1000;other.now+=1000;expect(engine.update(other).alert).toBeNull();
 const later=input(63);later.context.data.reportedRoads!.notices=[{...notice,id:'other'}];engine.update(later);expect(engine.update({...later,fix:{...later.fix,timestamp:later.fix.timestamp+1000},now:later.now+1000}).alert?.id).toBe('other');
});
