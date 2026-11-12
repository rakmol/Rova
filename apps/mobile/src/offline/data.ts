import {useSyncExternalStore} from 'react';
import {File,Paths} from 'expo-file-system';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {validateSafetyPack,type OfflineSafetyPack,type RoutingOption,type RoutingCoordinate} from '@rova/shared';
import {transactionalCache,type SlotStorage} from './cache';
import {setLowData} from './network';
export type SavedRoute={schema:1;savedAt:number;expiresAt:number;origin:RoutingCoordinate;destination:RoutingCoordinate;title:string;option:RoutingOption};
type Data={schema:1;route:SavedRoute|null;safety:OfflineSafetyPack|null;lowData:boolean};
const empty:Data={schema:1,route:null,safety:null,lowData:false};
let state={...empty,loaded:false,error:null as string|null};
const listeners=new Set<()=>void>();
const publish=()=>listeners.forEach(fn=>fn());
export const offlineData=()=>state;
export function useOfflineData(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},offlineData,offlineData);}
export function validateSavedRoute(raw:unknown):SavedRoute{
 const r=raw as SavedRoute,o=r?.option;
 if(!r||r.schema!==1||!Number.isFinite(r.savedAt)||!Number.isFinite(r.expiresAt)||r.expiresAt<=r.savedAt||r.expiresAt-r.savedAt>86400000||typeof r.title!=='string'||r.title.length>200
  ||![r.origin,r.destination].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)
  ||!o||o.isSample!==false||o.trafficAware!==false||o.etaKind!=='static_estimate'||typeof o.attribution!=='string'||o.geometry?.type!=='LineString'||!Array.isArray(o.geometry.coordinates)||o.geometry.coordinates.length<2||o.geometry.coordinates.length>20000
  ||o.geometry.coordinates.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)
  ||!Number.isFinite(o.distanceMeters)||o.distanceMeters<=0||!Number.isFinite(o.durationSeconds)||o.durationSeconds<=0||!Array.isArray(o.maneuvers)||!o.maneuvers.length||o.maneuvers.length>2000
  ||o.maneuvers.some(m=>typeof m.instruction!=='string'||m.instruction.length>2000||!Number.isInteger(m.geometryIndex)||m.geometryIndex!<0||m.geometryIndex!>=o.geometry.coordinates.length))throw new Error('Route cannot be saved for offline guidance. Refresh it while online.');
 return r;
}
function validate(raw:unknown):Data{const d=raw as Data;if(!d||d.schema!==1||typeof d.lowData!=='boolean')throw new Error('Incompatible offline cache.');return{schema:1,lowData:d.lowData,route:d.route===null?null:validateSavedRoute(d.route),safety:d.safety===null?null:validateSafetyPack(d.safety)};}
async function storage():Promise<SlotStorage>{
 if(!requireOptionalNativeModule('ExpoCryptoAES')||!requireOptionalNativeModule('ExpoSecureStore'))throw new Error('Install an updated ROVA build to enable encrypted offline downloads.');
 const crypto=await import('expo-crypto');
 const secure=await import('expo-secure-store');
 const options={keychainAccessible:secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
 let hex=await secure.getItemAsync('rova.offline.key');
 if(!hex){const key=await crypto.AESEncryptionKey.generate();hex=await key.encoded('hex');await secure.setItemAsync('rova.offline.key',hex,options);}
 const key=await crypto.AESEncryptionKey.import(hex,'hex');
 const file=(slot:string)=>new File(Paths.document,`rova-offline-${slot}.dat`);
 return{pointer:()=>secure.getItemAsync('rova.offline.slot'),commit:async slot=>{await secure.setItemAsync('rova.offline.slot',slot,options);try{const old=file(slot==='a'?'b':'a');if(old.exists)old.delete();}catch{ /* Key deletion during erase also covers any retained ciphertext. */ }},
  read:async slot=>{const f=file(slot);if(!f.exists||f.size>4000000)return null;const sealed=crypto.AESSealedData.fromCombined(await f.bytes());return new TextDecoder().decode(await crypto.aesDecryptAsync(sealed,key));},
  write:async(slot,value)=>{const bytes=await(await crypto.aesEncryptAsync(new TextEncoder().encode(value),key)).combined();const f=file(slot);f.create({overwrite:true});f.write(bytes);}};
}
let pending=Promise.resolve();
let hydration:Promise<void>|undefined;
export function loadOfflineData(){return hydration??=(async()=>{try{const value=await transactionalCache(await storage(),validate).read();state={...(value??empty),loaded:true,error:null};setLowData(state.lowData);}catch(e){state={...state,loaded:true,error:e instanceof Error?e.message:'Offline storage unavailable.'};}publish();})();}
export function updateOfflineData(change:(data:Data)=>Data){const work=pending.catch(()=>{}).then(async()=>{await loadOfflineData();const next=validate(change(state));await transactionalCache(await storage(),validate).write(next);state={...next,loaded:true,error:null};setLowData(next.lowData);publish();});pending=work;return work;}
export async function saveOfflineRoute(origin:RoutingCoordinate,destination:RoutingCoordinate,title:string,option:RoutingOption){const savedAt=Date.now();await updateOfflineData(d=>({...d,route:validateSavedRoute({schema:1,savedAt,expiresAt:savedAt+86400000,origin,destination,title,option})}));}
export function clearOfflineData(){const work=pending.catch(()=>{}).then(async()=>{if(!requireOptionalNativeModule('ExpoSecureStore')){state={...empty,loaded:true,error:null};setLowData(false);publish();return;}const secure=await import('expo-secure-store');await secure.deleteItemAsync('rova.offline.key');await secure.deleteItemAsync('rova.offline.slot');for(const slot of ['a','b']){const f=new File(Paths.document,`rova-offline-${slot}.dat`);if(f.exists)f.delete();}state={...empty,loaded:true,error:null};setLowData(false);publish();});pending=work;return work;}
