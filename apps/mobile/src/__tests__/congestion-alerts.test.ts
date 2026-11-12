import { CongestionAlertEngine } from '../navigation/congestion-alerts';
import type { CommunityIncident, RoutingCoordinate } from '@rova/shared';
import type { HazardFeedState } from '../incidents/realtime';
const now=1000000;
const report:CommunityIncident={id:'congestion-test',category:'congestion',status:'verified',coordinate:[-.196,5.6],approximateRadiusMeters:150,reportedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+600000).toISOString(),revision:1,confirmations:2,notThere:0,confidence:.6,evidence:'community',authorityVerified:false};
const feed:HazardFeedState={reports:[report],checkedAt:now,stale:false,transport:'stream',truncated:false};
const path:RoutingCoordinate[]=[[-.2,5.6],[-.19,5.6]];
const input={feed,fix:{coordinate:[-.2,5.6] as RoutingCoordinate,accuracy:8,timestamp:now,heading:90,speed:10},path,progress:0,now,navigating:true,suppressPrompt:false,audioEnabled:true};
const second={...input,now:now+1000,fix:{...input.fix,timestamp:now+1000}};
test('congestion speaks only after two distinct GPS fixes and never claims measured traffic',()=>{
  const engine=new CongestionAlertEngine();expect(engine.update(input).speak).toBeNull();expect(engine.update(input).speak).toBeNull();
  const result=engine.update(second);expect(result.speak).toBe('Possible congestion reported ahead near your route. Drive carefully.');expect(result.nearby?.distanceMeters).toBe(450);
  expect(engine.update({...second,now:now+2000,fix:{...input.fix,timestamp:now+2000}}).speak).toBeNull();
});
test('expired, withdrawn, stale, behind, distant-road and wrong-direction reports never warn',()=>{
  const cases=[{...input,feed:{...feed,stale:true}},{...input,feed:{...feed,checkedAt:now-31000}},
    {...input,feed:{...feed,reports:[{...report,expiresAt:new Date(now-1).toISOString()}]}},
    {...input,feed:{...feed,reports:[{...report,status:'pending' as const}]}},
    {...input,feed:{...feed,reports:[{...report,coordinate:[-.196,5.602] as RoutingCoordinate}]}},
    {...input,feed:{...feed,reports:[{...report,coordinate:[-.203,5.6] as RoutingCoordinate}]}},
    {...input,fix:{...input.fix,heading:270}},{...input,fix:{...input.fix,accuracy:50}},{...input,navigating:false}];
  for(const sample of cases){const engine=new CongestionAlertEngine();expect(engine.update(sample).nearby).toBeNull();expect(engine.update({...sample,now:now+1000,fix:{...sample.fix,timestamp:now+1000}}).speak).toBeNull();}
});
test('turn prompts take priority; muted alerts do not replay; nearby duplicate reports are suppressed',()=>{
  const engine=new CongestionAlertEngine();engine.update(input);expect(engine.update({...second,suppressPrompt:true}).speak).toBeNull();
  expect(engine.update({...second,audioEnabled:false}).speak).toBeNull();expect(engine.update(second).speak).toBeNull();
  const other=new CongestionAlertEngine();other.update(input);expect(other.update(second).speak).toBeTruthy();
  const later=now+121000;const duplicate={...report,id:'duplicate',reportedAt:new Date(later-1000).toISOString()};
  const next={...input,now:later,fix:{...input.fix,timestamp:later},feed:{...feed,checkedAt:later,reports:[duplicate]}};
  other.update(next);expect(other.update({...next,now:later+1000,fix:{...next.fix,timestamp:later+1000}}).speak).toBeNull();
});
