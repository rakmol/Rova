import {encryptedStore} from '../privacy/vault';
import { useEffect,useSyncExternalStore } from 'react';
export type Preferences={voiceEnabled:boolean;voiceLanguage:'en-GH'|'en-GB'|'en-US';units:'metric'|'imperial'};
export type SavedPlace={clientKey:string;kind:'home'|'work'|'favorite';label:string;address:string;attribution:string;lon:number;lat:number;storageProof?:string;owner?:string};
export type LocalDriverData={preferences:Preferences;places:SavedPlace[]};
export const defaults:LocalDriverData={preferences:{voiceEnabled:true,voiceLanguage:'en-GH',units:'metric'},places:[]};

export function validPlace(p:SavedPlace){return !!p&&typeof p.clientKey==='string'&&p.clientKey.length>0&&p.clientKey.length<=100&&['home','work','favorite'].includes(p.kind)&&typeof p.label==='string'&&!!p.label.trim()&&p.label.length<=80&&typeof p.address==='string'&&p.address.length<=300&&typeof p.attribution==='string'&&p.attribution.length<=500&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&(p.storageProof===undefined||(typeof p.storageProof==='string'&&p.storageProof.length>0&&p.storageProof.length<=1024))&&(p.owner===undefined||typeof p.owner==='string');}
export function validateLocal(raw:unknown):LocalDriverData{
  const d=raw as LocalDriverData;if(!d||!d.preferences||!['en-GH','en-GB','en-US'].includes(d.preferences.voiceLanguage)||!['metric','imperial'].includes(d.preferences.units)||typeof d.preferences.voiceEnabled!=='boolean'||!Array.isArray(d.places)||d.places.length>50||!d.places.every(validPlace))throw new Error('Saved data is invalid.');
  if(new Set(d.places.map(p=>p.clientKey)).size!==d.places.length||['home','work'].some(k=>d.places.filter(p=>p.kind===k).length>1))throw new Error('Duplicate saved places.');
  // Explicit field allowlist: no routes, positions, search history or auth tokens enter this file.
  return{preferences:{voiceEnabled:d.preferences.voiceEnabled,voiceLanguage:d.preferences.voiceLanguage,units:d.preferences.units},places:d.places.map(p=>({clientKey:p.clientKey,kind:p.kind,label:p.label.trim(),address:p.address,attribution:p.attribution,lon:p.lon,lat:p.lat,...(p.storageProof?{storageProof:p.storageProof}:{}),...(p.owner?{owner:p.owner}:{})}))};
}
const store=encryptedStore('driver',()=>({preferences:{...defaults.preferences},places:[]} as LocalDriverData),validateLocal,'rova-driver-data.json');
export const readDriverData=store.read;
export const loadDriverData=store.load;
export const driverStorageStatus=store.status;
export const updateDriverData=store.update;
export function saveLocalPlace(place:SavedPlace){if(place.attribution!=='User entered'&&!place.storageProof)return Promise.reject(new Error('Refresh this place in search before saving. Provider storage permission is unavailable.'));return updateDriverData(d=>({...d,places:[...d.places.filter(p=>p.clientKey!==place.clientKey&&(place.kind==='favorite'||p.kind!==place.kind)),place]}));}
export const clearLocalDriverData=store.erase;
export function clearAccountPlaces(){return updateDriverData(d=>({...d,places:d.places.filter(p=>!p.owner)}));}
export function useDriverData(){useEffect(()=>{void loadDriverData().catch(()=>{});},[]);return useSyncExternalStore(store.subscribe,readDriverData,()=>defaults);}
export function travelDistance(meters:number,units:Preferences['units']){return units==='imperial'?(meters<160.934?`${Math.round(meters*3.28084/10)*10} ft`:`${(meters/1609.344).toFixed(1)} mi`):meters<1000?`${Math.round(meters/10)*10} m`:`${(meters/1000).toFixed(1)} km`;}
export function voicePreferenceText(text:string,preferences:Preferences){return preferences.units==='imperial'?text.replace(/\b(\d+(?:\.\d+)?) metres\b/g,(_,n)=>`${Math.round(Number(n)*3.28084/10)*10} feet`):text;}
