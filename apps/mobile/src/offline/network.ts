import {useSyncExternalStore} from 'react';
import {requireOptionalNativeModule} from 'expo-modules-core';
export type NetworkStatus='unknown'|'online'|'offline'|'degraded';
let state:{status:NetworkStatus;lowData:boolean;changedAt:number}={status:'unknown',lowData:false,changedAt:Date.now()};
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(fn=>fn());
export const networkSnapshot=()=>state;
export function setLowData(value:boolean){state={...state,lowData:value};notify();}
export function networkObservation(value:{isConnected?:boolean;isInternetReachable?:boolean}){
 const status=value.isConnected===false||value.isInternetReachable===false?'offline':value.isInternetReachable===true?'online':'unknown';
 state={...state,status,changedAt:Date.now()};notify();
}
export function requestOutcome(ok:boolean){if(state.status==='offline')return;state={...state,status:ok?'online':'degraded',changedAt:Date.now()};notify();}
export const subscribeNetwork=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function useNetwork(){return useSyncExternalStore(subscribeNetwork,networkSnapshot,networkSnapshot);}
export function startNetworkMonitor(){
 try{
  if(!requireOptionalNativeModule('ExpoNetwork'))return()=>{};
  // Guard optional native modules so older installed APKs keep working until rebuilt.
  let active=true;let remove=()=>{};
  void import('expo-network').then(async api=>{if(!active)return;const sub=api.addNetworkStateListener(networkObservation);remove=()=>sub.remove();const state=await api.getNetworkStateAsync();if(active)networkObservation(state);}).catch(()=>{});
  return()=>{active=false;remove();};
 }catch{return()=>{};}
}
