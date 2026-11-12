import {useSyncExternalStore} from 'react';
export type MotionFix={speed:number|null;accuracy:number|null;timestamp:number};
export class DriverInteractionPolicy{
 locked=false;private stationarySince:number|null=null;private lastTimestamp=-Infinity;
 update(fix:MotionFix,now:number){
  if(fix.speed===null||!Number.isFinite(fix.speed)||fix.speed<0||fix.accuracy===null||!Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>25||now-fix.timestamp>10000||fix.timestamp>now+2000||fix.timestamp<=this.lastTimestamp)return;
  if(fix.timestamp-this.lastTimestamp>5000)this.stationarySince=null;
  this.lastTimestamp=fix.timestamp;
  if(fix.speed>=1.5){this.locked=true;this.stationarySince=null;}
  else if(fix.speed<=.4){this.stationarySince??=fix.timestamp;if(fix.timestamp-this.stationarySince>=8000)this.locked=false;}
  else this.stationarySince=null;
 }
 beginNavigation(){this.locked=true;this.stationarySince=null;}
}
const policy=new DriverInteractionPolicy();
let state={locked:false,navigation:false,passenger:false};let passengerUntil=0;
let passengerTimer:ReturnType<typeof setTimeout>|undefined;
const listeners=new Set<()=>void>();
function publish(){const next={locked:policy.locked,navigation:state.navigation,passenger:passengerUntil>Date.now()};if(Object.keys(next).some(k=>next[k as keyof typeof next]!==state[k as keyof typeof state])){state=next;listeners.forEach(fn=>fn());}}
export function observeMotion(fix:MotionFix,now=Date.now()){policy.update(fix,now);publish();}
export function navigationInteraction(active:boolean){if(active&&!state.navigation)policy.beginNavigation();state={...state,locked:policy.locked,navigation:active,passenger:passengerUntil>Date.now()};listeners.forEach(fn=>fn());}
export function acknowledgePassenger(){clearTimeout(passengerTimer);passengerUntil=Date.now()+300000;passengerTimer=setTimeout(()=>{passengerUntil=0;publish();},300000);publish();}
export function resetPassenger(){clearTimeout(passengerTimer);passengerUntil=0;publish();}
export function expirePassenger(){publish();}
export const drivingSnapshot=()=>state;
export const subscribeDriving=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function useDrivingSafety(){return useSyncExternalStore(subscribeDriving,drivingSnapshot,drivingSnapshot);}
