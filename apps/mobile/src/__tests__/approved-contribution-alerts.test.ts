import {ApprovedContributionAlertEngine} from '../navigation/approved-contribution-alerts';
import type {CommunityMapPin,ApprovedContributionFeed} from '../contributions/mapPins';
import type {RoutingCoordinate} from '@rova/shared';
const now=1000000;
const pin:CommunityMapPin={id:'TEST-ONLY',kind:'fixed_camera',name:'DEMO ONLY',category:'fixed_speed',direction:'eastbound',coordinate:[-.196,5.6],expiresAt:new Date(now+600000).toISOString(),reviewedAt:new Date(now).toISOString(),rovaVerified:true,revision:2,approximateRadiusMeters:null,authorityVerified:false,evidence:'community'};
const feed:ApprovedContributionFeed={pins:[pin],checkedAt:now,stale:false};
const input={feed,fix:{coordinate:[-.2,5.6] as RoutingCoordinate,accuracy:8,timestamp:now,heading:90,speed:10},path:[[-.2,5.6],[-.19,5.6]] as RoutingCoordinate[],progress:0,now,navigating:true,suppressPrompt:false,audioEnabled:true};
function next(value= input,elapsed=1000){return{...value,now:now+elapsed,fix:{...value.fix,timestamp:now+elapsed}};}
test.each([
 ['place','landmark','Approaching DEMO ONLY. ROVA verified.'],
 ['fixed_camera','fixed_speed','ROVA verified speed camera area ahead. Follow posted speed limits.'],
 ['fixed_camera','red_light','ROVA verified red light camera area ahead. Obey the traffic signals.'],
 ['fixed_camera','unknown','ROVA verified fixed enforcement equipment near your route. Follow road signs.'],
 ...['pothole','flood','collision','closure','congestion','obstacle'].map(category=>['hazard',category,null]),
])('all approved types speak with two distinct reliable fixes: %s/%s',(kind,category,text)=>{
 const sample={...input,feed:{...feed,pins:[{...pin,kind:kind as CommunityMapPin['kind'],category:category!,approximateRadiusMeters:kind==='hazard'?150:null}]}};
 const engine=new ApprovedContributionAlertEngine();expect(engine.update(sample).speak).toBeNull();expect(engine.update(sample).speak).toBeNull();
 const result=engine.update(next(sample));expect(result.speak).toEqual(text??expect.stringMatching(/^ROVA verified .* report ahead near your route/));
 expect(result.speak).not.toMatch(/80|official|police|live traffic/i);
 expect(engine.update(next(sample,2000)).speak).toBeNull();
});
test('unapproved, withdrawn, expired, stale, behind, distant, wrong-direction and unreliable GPS never speak',()=>{
 const cases=[{...input,feed:{...feed,pins:[]}},{...input,feed:{...feed,stale:true}},{...input,feed:{...feed,checkedAt:now-31000}},
 {...input,feed:{...feed,pins:[{...pin,rovaVerified:false} as unknown as CommunityMapPin]}},
 ...[{expiresAt:new Date(now-1).toISOString()},{coordinate:[-.203,5.6]},{coordinate:[-.196,5.602]},{direction:'westbound'}].map(change=>({...input,feed:{...feed,pins:[{...pin,...change} as CommunityMapPin]}})),
 {...input,fix:{...input.fix,accuracy:50}},{...input,fix:{...input.fix,heading:270}},{...input,navigating:false},
 {...input,fix:{...input.fix,timestamp:now-4000}}];
 for(const sample of cases){const engine=new ApprovedContributionAlertEngine();expect(engine.update(sample).speak).toBeNull();expect(engine.update({...sample,now:now+500}).speak).toBeNull();}
});
test('withdrawal discards pending eligibility and renewed approval requires distinct fixes',()=>{
 const engine=new ApprovedContributionAlertEngine();engine.update(input);engine.update(next({...input,feed:{...feed,pins:[]}}));
 expect(engine.update(next(input,2000)).speak).toBeNull();expect(engine.update(next(input,3000)).speak).toBeTruthy();
});
test('turn priority, cooldown, mute and duplicate suppression do not starve other approved contributions',()=>{
 const engine=new ApprovedContributionAlertEngine();engine.update(input);expect(engine.update({...next(),suppressPrompt:true}).speak).toBeNull();expect(engine.update(next(input,2000)).speak).toBeTruthy();
 const duplicate={...pin,id:'duplicate'},other={...pin,id:'place',kind:'place' as const,category:'landmark',coordinate:[-.195,5.6] as RoutingCoordinate};
 const sample={...input,feed:{...feed,pins:[pin,duplicate,other]}};
 expect(engine.update(next(sample,3000)).speak).toBeNull();
 expect(engine.update(next(sample,14000)).speak).toBeNull(); // Long GPS gap needs fresh confirmation.
 expect(engine.update(next(sample,15000)).speak).toMatch(/^Approaching/);
 const muted=new ApprovedContributionAlertEngine();muted.update(input);expect(muted.update({...next(),audioEnabled:false}).speak).toBeNull();expect(muted.update(next(input,2000)).speak).toBeNull();
});
test('unknown camera direction stays qualified; ambiguous route crossings never announce',()=>{
 const engine=new ApprovedContributionAlertEngine(),sample={...input,feed:{...feed,pins:[{...pin,direction:'towards the market'}]}};
 engine.update(sample);expect(engine.update(next(sample)).speak).toMatch(/area ahead/);
 const ambiguous={...input,path:[[-.2,5.6],[-.196,5.6],[-.196,5.6001],[-.2,5.6001],[-.2,5.6],[-.196,5.6]] as RoutingCoordinate[]};
 const second=new ApprovedContributionAlertEngine();second.update(ambiguous);expect(second.update(next(ambiguous)).speak).toBeNull();
});
