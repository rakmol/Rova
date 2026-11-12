import { approximateFix, canInteract, submitIncident, nearbyIncidents } from '../incidents/client';
jest.mock('expo-constants',()=>({__esModule:true,default:{expoConfig:{hostUri:'example.exp.direct'}}}));
const mockWrite=jest.fn();
jest.mock('expo-file-system',()=>({Paths:{document:'test://'},File:jest.fn(()=>({exists:false,create:jest.fn(),textSync:()=>{throw new Error('missing');},write:mockWrite,delete:jest.fn()}))}));
const fix={lon:-.201234567,lat:5.61234567,accuracy:8,timestamp:Date.now(),speed:0};
test('parked/passenger safety gate rejects moving drivers, unknown speed, bad GPS and stale fixes',()=>{
  expect(canInteract('parked',fix)).toBe(true);expect(canInteract('parked',{...fix,speed:10})).toBe(false);
  expect(canInteract('parked',{...fix,speed:null})).toBe(false);expect(canInteract('passenger',{...fix,speed:10})).toBe(true);
  for(const f of [{...fix,accuracy:51},{...fix,timestamp:Date.now()-61000},{...fix,lat:Infinity}])expect(canInteract('passenger',f)).toBe(false);
  expect(canInteract(null,fix)).toBe(false);expect(approximateFix(fix)).toEqual({lon:-.201,lat:5.612,accuracy:8,timestamp:fix.timestamp});
});
test('submission rounds on the phone, stores only anonymous session, and does not queue or retry writes',async()=>{
  const fetchMock=jest.fn().mockResolvedValueOnce({ok:true,json:async()=>({token:'a'.repeat(64),expiresAt:new Date(Date.now()+86400000).toISOString()})})
    .mockResolvedValueOnce({ok:true,json:async()=>({id:'test',duplicate:false})})
    .mockResolvedValueOnce({ok:false,status:429});
  const before=global.fetch;global.fetch=fetchMock;
  try{
    expect(await submitIncident('pothole',fix,'parked','Private note')).toMatchObject({duplicate:false});
    const body=JSON.parse(fetchMock.mock.calls[1][1].body);expect(body.fix.lon).toBe(-.201);expect(body.fix.lat).toBe(5.612);expect(body.fix.speed).toBeUndefined();
    expect(mockWrite).not.toHaveBeenCalled(); // Credential is never written through the ordinary file API.
    await expect(submitIncident('pothole',fix,'parked')).rejects.toThrow('Too many');expect(fetchMock).toHaveBeenCalledTimes(3);
    await expect(submitIncident('pothole',{...fix,speed:20},'parked')).rejects.toThrow('Park safely');expect(fetchMock).toHaveBeenCalledTimes(3);
  }finally{global.fetch=before;}
});
test('nearby response rejects community reports promoted to authority verification',async()=>{
  const before=global.fetch;global.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({reports:[{id:'fake',category:'pothole',status:'verified',evidence:'community',authorityVerified:true,coordinate:[-.2,5.6],approximateRadiusMeters:150,confidence:1,reportedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+10000).toISOString()}]})});
  try{await expect(nearbyIncidents(fix)).rejects.toThrow('Invalid incident response');}finally{global.fetch=before;}
});
