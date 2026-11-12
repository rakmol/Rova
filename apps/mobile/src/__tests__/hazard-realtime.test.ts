import { HazardFeed, parseHazardSnapshot, retryDelay, selectHazardRegion, SseParser, type HazardFeedState, type HazardTransport } from '../incidents/realtime';
const id='12345678-1234-4234-8234-123456789012';
test('region hysteresis retains a subscription near cell corners and changes it after significant movement',()=>{
  const region:[number,number]=[-.2,5.6];
  expect(selectHazardRegion(region,[-.1901,5.6099])).toBe(region);
  expect(selectHazardRegion(region,[-.1899,5.6101])).toBe(region);
  expect(selectHazardRegion(region,[-.18,5.6])).toEqual([-.18,5.6]);
});
function snapshot(now=Date.now(),reports:unknown[]=[]){return{type:'snapshot',region:{lon:-.2,lat:5.6,radiusMeters:4000},checkedAt:new Date(now).toISOString(),reports,truncated:false,traffic:{status:'unavailable',measurements:false}};}
function report(now=Date.now()){return{id,category:'pothole',status:'verified',coordinate:[-.2,5.6],approximateRadiusMeters:150,reportedAt:new Date(now-60000).toISOString(),expiresAt:new Date(now+5000).toISOString(),revision:1,confirmations:2,notThere:0,confidence:.6,evidence:'community',authorityVerified:false};}
test('SSE handles fragmented frames and rejects huge frames; delayed expired records cannot reappear',()=>{
  const parser=new SseParser();expect(parser.push('event: snapshot\r\n')).toEqual([]);
  expect(parser.push('data: {"ok":true}\r\n\r')).toEqual([]);
  expect(parser.push('\n')).toEqual([{event:'snapshot',data:{ok:true}}]);
  expect(()=>parser.push('x'.repeat(131073))).toThrow('too large');
  const now=Date.now();expect(parseHazardSnapshot(snapshot(now,[{...report(now),expiresAt:new Date(now-1).toISOString()}]),now).reports).toEqual([]);
  expect(()=>parseHazardSnapshot(snapshot(now,[{...report(now),status:'pending'}]),now)).toThrow();
  expect(()=>parseHazardSnapshot(snapshot(now,[{...report(now),authorityVerified:true}]),now)).toThrow();
  expect(()=>parseHazardSnapshot(snapshot(now-61000),now)).toThrow();
});
test('feed uses full replacement, expiry, stale labels, periodic fallback and aborts on unsubscribe',async()=>{
  jest.useFakeTimers();let receive:((s:unknown)=>void)|undefined;let aborted=false;
  const transport:HazardTransport={stream:(signal,onSnapshot)=>{receive=onSnapshot;return new Promise(resolve=>signal.addEventListener('abort',()=>{aborted=true;resolve();}));},refresh:jest.fn(async()=>snapshot())};
  const states:HazardFeedState[]=[];const feed=new HazardFeed(transport,s=>states.push(s),[-.2,5.6]);
  try{
    feed.start();await jest.advanceTimersByTimeAsync(0);const now=Date.now();receive?.(snapshot(now,[report(now)]));expect(states.at(-1)?.reports).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(6000);expect(states.at(-1)?.reports).toHaveLength(0);
    (transport.refresh as jest.Mock).mockRejectedValue(new Error('offline'));
    await jest.advanceTimersByTimeAsync(26000);expect(states.at(-1)?.stale).toBe(true);expect(transport.refresh).toHaveBeenCalledTimes(2);
    receive?.(snapshot());expect(states.at(-1)?.stale).toBe(false);expect(states.at(-1)?.reports).toHaveLength(0);
    feed.stop();const count=states.length;await jest.advanceTimersByTimeAsync(60000);expect(states).toHaveLength(count);expect(aborted).toBe(true);
  }finally{feed.stop();jest.useRealTimers();}
});
test('reconnect has jitter and bounded exponential backoff, ignores older frames, and removes withdrawn records',async()=>{
  jest.useFakeTimers();let receive:((s:unknown)=>void)|undefined;
  const transport:HazardTransport={stream:jest.fn().mockRejectedValueOnce(new Error('offline')).mockImplementation((_signal,onSnapshot)=>{receive=onSnapshot;return new Promise(()=>{});}),refresh:jest.fn(async()=>snapshot())};
  const states:HazardFeedState[]=[];const feed=new HazardFeed(transport,s=>states.push(s),[-.2,5.6]);
  try{
    feed.start();await jest.advanceTimersByTimeAsync(0);await jest.advanceTimersByTimeAsync(1300);expect(transport.stream).toHaveBeenCalledTimes(2);
    const now=Date.now();receive?.(snapshot(now,[report(now)]));expect(states.at(-1)?.reports).toHaveLength(1);
    receive?.(snapshot(now-1000));expect(states.at(-1)?.reports).toHaveLength(1);expect(feed.metrics.ignoredOlderSnapshots).toBe(1);
    receive?.(snapshot(now+1));expect(states.at(-1)?.reports).toHaveLength(0);
    expect(retryDelay(0,()=>.5)).toBe(1000);expect(retryDelay(99,()=>1)).toBe(30000);
  }finally{feed.stop();jest.useRealTimers();}
});
