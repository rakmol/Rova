import {independentCleanup} from '../privacy/cleanup';
import {useSyncExternalStore} from 'react';
import {File,Paths} from 'expo-file-system';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {defaultNotificationPreferences,validRenewalDate,type NotificationPreferences} from '@rova/shared';
import {transactionalCache} from '../offline/cache';
export function validatePreferences(raw:unknown):NotificationPreferences{
 const p=raw as NotificationPreferences;
 if(!p||['enabled','closures','policy','reminders'].some(k=>typeof p[k as keyof NotificationPreferences]!=='boolean')||p.marketing!==false||p.currentTrip!==false||p.timeZone!=='Africa/Accra'||![1,2].includes(p.dailyCap)
 ||!Array.isArray(p.regions)||p.regions.length>5||p.regions.some(r=>!r||typeof r.id!=='string'||!r.id||r.id.length>100||typeof r.label!=='string'||!r.label.trim()||r.label.length>80||!Number.isFinite(r.lon)||r.lon< -4||r.lon>2||!Number.isFinite(r.lat)||r.lat<4||r.lat>12)
 ||new Set(p.regions.map(r=>r.id)).size!==p.regions.length||!Array.isArray(p.renewals)||p.renewals.length>2||p.renewals.some(r=>!r||!['insurance','roadworthiness'].includes(r.kind)||!validRenewalDate(r.dueDate))||new Set(p.renewals.map(r=>r.kind)).size!==p.renewals.length)throw new Error('Check your renewal dates (YYYY-MM-DD) and saved regions.');
 return{enabled:p.enabled,closures:p.closures,policy:p.policy,reminders:p.reminders,marketing:false,currentTrip:false,timeZone:'Africa/Accra',dailyCap:p.dailyCap,regions:p.regions.map(r=>({id:r.id,label:r.label.trim(),lon:Math.round(r.lon*50)/50,lat:Math.round(r.lat*50)/50})),renewals:p.renewals.map(r=>({kind:r.kind,dueDate:r.dueDate}))};
}
let state={preferences:defaultNotificationPreferences,loaded:false,error:''};const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
export const notificationData=()=>state;
export const useNotificationData=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},notificationData,notificationData);
async function cache(){
 if(!requireOptionalNativeModule('ExpoSecureStore')||!requireOptionalNativeModule('ExpoCryptoAES'))throw new Error('Install the updated ROVA app to use encrypted reminder storage.');
 const secure=await import('expo-secure-store'),crypto=await import('expo-crypto');const options={keychainAccessible:secure.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
 let hex=await secure.getItemAsync('rova.notifications.key');if(!hex){hex=await(await crypto.AESEncryptionKey.generate()).encoded('hex');await secure.setItemAsync('rova.notifications.key',hex,options);}
 const key=await crypto.AESEncryptionKey.import(hex,'hex'),file=(slot:string)=>new File(Paths.document,`rova-notifications-${slot}.dat`);
 return transactionalCache({pointer:()=>secure.getItemAsync('rova.notifications.slot'),commit:async slot=>{await secure.setItemAsync('rova.notifications.slot',slot,options);const old=file(slot==='a'?'b':'a');if(old.exists)old.delete();},read:async slot=>{const f=file(slot);if(!f.exists)return null;if(f.size>16384)throw new Error('Reminder storage is invalid.');return new TextDecoder().decode(await crypto.aesDecryptAsync(crypto.AESSealedData.fromCombined(await f.bytes()),key));},write:async(slot,value)=>{const bytes=await(await crypto.aesEncryptAsync(new TextEncoder().encode(value),key)).combined();const f=file(slot);f.create({overwrite:true});f.write(bytes);}},validatePreferences);
}
let hydration:Promise<void>|undefined,queue=Promise.resolve();
export function loadNotificationData(){return hydration??=(async()=>{try{state={preferences:await(await cache()).read()??defaultNotificationPreferences,loaded:true,error:''};}catch(e){state={...state,loaded:true,error:e instanceof Error?e.message:'Reminders unavailable.'};}emit();})();}
export function persistNotifications(raw:NotificationPreferences){const work=queue.catch(()=>{}).then(async()=>{await loadNotificationData();const p=validatePreferences(raw);await(await cache()).write(p);state={preferences:p,loaded:true,error:''};emit();});queue=work;return work;}
export async function eraseNotificationStorage(){await queue.catch(()=>{});await hydration?.catch(()=>{});state={preferences:defaultNotificationPreferences,loaded:true,error:''};emit();const result=await independentCleanup([{name:'key',run:async()=>{await(await import('expo-secure-store')).deleteItemAsync('rova.notifications.key');}},{name:'pointer',run:async()=>{await(await import('expo-secure-store')).deleteItemAsync('rova.notifications.slot');}},...['a','b'].map(slot=>({name:slot,run:async()=>{const f=new File(Paths.document,`rova-notifications-${slot}.dat`);if(f.exists)f.delete();}}))]);if(!result.complete)throw new Error('Some reminder files could not be erased. Please retry.');}
