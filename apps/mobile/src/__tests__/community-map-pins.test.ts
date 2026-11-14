import {parseCommunityPins} from '../contributions/mapPins';
jest.mock('../incidents/client',()=>({reportingRequest:jest.fn()}));
test('community map pins reject authority claims, invalid points and stale snapshots and remove expired observations',()=>{
 const now=Date.now(),pin={id:'fixture-only',kind:'fixed_camera',name:'TEST ONLY',category:'unknown',direction:'',coordinate:[-.2,5.6],expiresAt:new Date(now+60000).toISOString(),reviewedAt:new Date(now).toISOString(),authorityVerified:false,evidence:'community'};
 const snapshot={authorityVerified:false,checkedAt:new Date(now).toISOString(),pins:[pin]};
 expect(parseCommunityPins(snapshot,now)).toEqual([pin]);
 for(const change of [{authorityVerified:true},{evidence:'official'},{coordinate:[180,0]},{kind:'mobile_camera'}])expect(()=>parseCommunityPins({...snapshot,pins:[{...pin,...change}]},now)).toThrow();
 expect(parseCommunityPins({...snapshot,pins:[{...pin,expiresAt:new Date(now-1).toISOString()}]},now)).toEqual([]);
 expect(()=>parseCommunityPins(snapshot,now+61000)).toThrow();
});
