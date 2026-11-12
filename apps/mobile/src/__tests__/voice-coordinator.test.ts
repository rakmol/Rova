import {VoiceCoordinator,type CueKind} from '../navigation/voice-coordinator';
let now:number;let said:{text:string;done:()=>void;failed:()=>void}[];let stop:jest.Mock;let voice:VoiceCoordinator;
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const cue=(id:string,kind:CueKind,life=3000)=>({id,kind,text:id,createdAt:now,expiresAt:now+life});
beforeEach(()=>{jest.useFakeTimers();now=100;said=[];stop=jest.fn(async()=>{});voice=new VoiceCoordinator({stop,speak:(text,done,failed)=>said.push({text,done,failed})},()=>now);});
afterEach(async()=>{voice.stop();await flush();jest.useRealTimers();});
test('maneuvers preempt community/safety, lower priority cannot interrupt, and old completion callbacks cannot stop the maneuver',async()=>{
 voice.submit(cue('report','community'));await flush();voice.submit(cue('turn','maneuver'));await flush();expect(said.map(s=>s.text)).toEqual(['report','turn']);
 said[0].done();expect(voice.speakingKind).toBe('maneuver');voice.submit(cue('speed','safety'));await flush();expect(said).toHaveLength(2);
 said[1].done();await flush();expect(said.map(s=>s.text)).toEqual(['report','turn','speed']);expect(stop).toHaveBeenCalledTimes(3);
});
test('expired queued warnings, duplicate cues, mute/stop and replacement turn prompts never replay stale instructions',async()=>{
 voice.submit(cue('approach','maneuver',10000));await flush();voice.submit(cue('old-speed','safety',100));expect(voice.submit(cue('old-speed','safety'))).toBe(false);
 now+=1000;said[0].done();await flush();expect(said).toHaveLength(1);
 voice.submit(cue('turn-now','maneuver'));await flush();voice.submit(cue('new-turn','maneuver'));await flush();expect(said.at(-1)?.text).toBe('new-turn');
 voice.submit(cue('arrival','arrival'));await flush();expect(said.at(-1)?.text).toBe('arrival');voice.submit(cue('waiting','community'));voice.stop();said.at(-1)!.done();await flush();expect(voice.speakingKind).toBeNull();expect(voice.pendingCount).toBe(0);
});
test('a burst of 10000 alerts keeps the queue bounded and a stalled native voice is stopped by the watchdog',async()=>{
 voice.submit(cue('maneuver','maneuver',100000));await flush();for(let i=0;i<10000;i++)voice.submit(cue('community-'+i,'community'));expect(voice.pendingCount).toBe(1);expect(said).toHaveLength(1);
 now+=31000;jest.advanceTimersByTime(31000);await flush();expect(voice.speakingKind).toBeNull();expect(said).toHaveLength(1);expect(stop.mock.calls.length).toBeGreaterThanOrEqual(2);
});
