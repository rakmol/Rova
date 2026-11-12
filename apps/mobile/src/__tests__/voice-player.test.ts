import {createVoicePlayer} from '../navigation/voice';
import * as Speech from 'expo-speech';
jest.mock('expo',()=>({requireOptionalNativeModule:()=>({})}));
jest.mock('expo-speech',()=>({stop:jest.fn(async()=>{}),speak:jest.fn()}));
jest.mock('../account/local',()=>({readDriverData:()=>({preferences:{voiceEnabled:true,voiceLanguage:'en-GH',units:'metric'}}),voicePreferenceText:(text:string)=>text}));
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('only the latest navigation session owns speech; an old session cannot interrupt or overlap it',async()=>{
 jest.useFakeTimers();const old=createVoicePlayer(jest.fn());old.speak('OLD TEST CUE');await flush();
 const current=createVoicePlayer(jest.fn());current.speak('CURRENT TEST CUE');await flush();expect(Speech.speak).toHaveBeenCalledTimes(2);
 const count=jest.mocked(Speech.stop).mock.calls.length;old.speak('STALE TEST CUE');old.stop();await flush();expect(Speech.speak).toHaveBeenCalledTimes(2);expect(Speech.stop).toHaveBeenCalledTimes(count);
 expect(jest.mocked(Speech.speak).mock.calls.at(-1)?.[0]).toBe('CURRENT TEST CUE');current.stop();await flush();jest.useRealTimers();
});
