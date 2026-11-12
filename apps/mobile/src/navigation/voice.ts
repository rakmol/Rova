import { requireOptionalNativeModule } from "expo";
import { readDriverData, voicePreferenceText } from '../account/local';
import {tx} from '../i18n';
import {VoiceCoordinator,type CueKind} from './voice-coordinator';
export const speechAvailable=Boolean(requireOptionalNativeModule('ExpoSpeech'));
let speech:typeof import('expo-speech')|undefined;
if(speechAvailable){
 // Guard old native APKs before loading their speech binding.
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 speech=require('expo-speech');
}
let prior:ReturnType<typeof createPlayer>|undefined;
let owner=0;
function createPlayer(onError:(message:string)=>void,isOwner:()=>boolean){
 let sequence=0;
 const coordinator=new VoiceCoordinator({
  stop:()=>isOwner()?speech?.stop():undefined,
  speak:(text,done,failed)=>{
   const preferences=readDriverData().preferences;
   if(!isOwner()||!speech||!preferences.voiceEnabled){done();return;}
   speech.speak(voicePreferenceText(text,preferences),{language:preferences.voiceLanguage,rate:.95,onDone:done,onStopped:done,onError:failed});
  },
 },Date.now,()=>onError(tx('voice.unavailable')));
 return{stop:()=>coordinator.stop(),speak(text:string,options?:{kind:CueKind;id:string}){
  if(!isOwner())return;
  if(!speech||!readDriverData().preferences.voiceEnabled){coordinator.stop();return;}
  const now=Date.now(),kind=options?.kind??'maneuver';
  coordinator.submit({id:options?.id??'cue:'+ ++sequence,text,kind,createdAt:now,expiresAt:now+(kind==='community'?3000:kind==='safety'?3000:10000)});
 }};
}
export function createVoicePlayer(onError:(message:string)=>void){prior?.stop();const id=++owner;void Promise.resolve().then(()=>speech?.stop()).catch(()=>onError(tx('voice.unavailable')));prior=createPlayer(onError,()=>id===owner);return prior;}
