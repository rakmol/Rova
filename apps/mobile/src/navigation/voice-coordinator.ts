export type CueKind='maneuver'|'arrival'|'safety'|'community';
export type VoiceCue={id:string;text:string;kind:CueKind;createdAt:number;expiresAt:number};
export interface VoiceDriver {stop():Promise<void>|void;speak(text:string,done:()=>void,failed:()=>void):void}
const priority:Record<CueKind,number>={arrival:110,maneuver:100,safety:70,community:30};
/** One audible cue, at most one waiting cue per kind, no late replay of stale alerts. */
export class VoiceCoordinator{
 private watchdog:ReturnType<typeof setTimeout>|undefined;
 private current:VoiceCue|null=null;private waiting=new Map<CueKind,VoiceCue>();private generation=0;
 private recent=new Map<string,number>();
 constructor(private driver:VoiceDriver,private now:()=>number=Date.now,private onError:()=>void=()=>{}){}
 get pendingCount(){return this.waiting.size;}
 get speakingKind(){return this.current?.kind??null;}
 submit(cue:VoiceCue){
  const now=this.now();if(!cue.text.trim()||cue.expiresAt<=now||cue.createdAt>now+1000||this.recent.has(cue.id))return false;
  this.recent.set(cue.id,now);while(this.recent.size>256)this.recent.delete(this.recent.keys().next().value!);
  this.waiting.set(cue.kind,cue);
  if(this.current&&(priority[cue.kind]>priority[this.current.kind]||(cue.kind==='maneuver'&&this.current.kind==='maneuver'))){clearTimeout(this.watchdog);this.generation++;this.current=null;}
  this.pump();return true;
 }
 private pump(){
  if(this.current)return;
  const now=this.now();for(const[k,v]of this.waiting)if(v.expiresAt<=now)this.waiting.delete(k);
  const next=[...this.waiting.values()].sort((a,b)=>priority[b.kind]-priority[a.kind]||b.createdAt-a.createdAt)[0];if(!next)return;
  this.waiting.delete(next.kind);this.current=next;const token=++this.generation;
  const finish=(failed=false)=>{if(token!==this.generation)return;clearTimeout(this.watchdog);this.current=null;if(failed)this.onError();this.pump();};
  void Promise.resolve().then(()=>this.driver.stop()).then(()=>{if(token!==this.generation)return;if(next.expiresAt<=this.now()){finish();return;}this.watchdog=setTimeout(()=>{if(token===this.generation){void Promise.resolve().then(()=>this.driver.stop()).catch(()=>{});finish(true);}},30000);this.driver.speak(next.text,()=>finish(),()=>finish(true));}).catch(()=>finish(true));
 }
 stop(){clearTimeout(this.watchdog);this.generation++;this.current=null;this.waiting.clear();void Promise.resolve().then(()=>this.driver.stop()).catch(()=>this.onError());}
}
