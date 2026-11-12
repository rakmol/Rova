import Constants from 'expo-constants';
import {offlineSpeedLimit,validateSafetyPack,type ComplianceContext,type VehicleClass} from '@rova/shared';
import {offlineData,updateOfflineData} from './data';
import {networkSnapshot,requestOutcome} from './network';
import type {Fix} from '../navigation/session';
const host=Constants.expoConfig?.hostUri;
const tunnel=__DEV__&&typeof host==='string'&&['.on.expo.app','.exp.direct','.ngrok-free.app'].some(s=>host.endsWith(s))?`https://${host}/rova-api/safety/offline-pack`:undefined;
export async function downloadSafetyPack(lon:number,lat:number,vehicleType:VehicleClass){
 if(process.env.EXPO_PUBLIC_PILOT_MODE==='true')throw new Error('Pilot safety data requires current corridor approval online. Offline numeric limits are disabled.');
 if(networkSnapshot().status==='offline')throw new Error('Offline. Reconnect before downloading safety data.');
 const endpoint=process.env.EXPO_PUBLIC_OFFLINE_SAFETY_API_URL||tunnel;if(!endpoint)throw new Error('Offline safety download is not configured.');
 const url=new URL(endpoint);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Offline download requires HTTPS.');
 url.searchParams.set('lon',String(Math.round(lon*100)/100));url.searchParams.set('lat',String(Math.round(lat*100)/100));url.searchParams.set('vehicleType',vehicleType);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(url.toString(),{signal:controller.signal});if(!response.ok)throw new Error(response.status===503?'No preapproved offline safety dataset is available for this area.':'Could not download safety data. Reconnect and retry.');
  const text=await response.text();if(text.length>2100000)throw new Error('Offline safety download is too large.');
  const pack=validateSafetyPack(JSON.parse(text));
  if(pack.vehicleType!==vehicleType||Date.now()<pack.createdAt-2000||Date.now()>=pack.expiresAt)throw new Error('Offline download is stale or mismatched.');
  const {version,...content}=pack;
  const crypto=await import('expo-crypto');
  if('sha256:'+await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256,JSON.stringify(content))!==version)throw new Error('Incomplete offline download. Previous data was kept.');
  await updateOfflineData(d=>({...d,safety:pack}));requestOutcome(true);
  return pack.roads.filter(r=>r.record.rules.length>0).length;
 }finally{clearTimeout(timer);}
}
export function offlineCompliance(fix:Fix,vehicleType:VehicleClass):ComplianceContext{
 const now=Date.now();const result=offlineSpeedLimit(process.env.EXPO_PUBLIC_PILOT_MODE==='true'?null:offlineData().safety,{lon:fix.coordinate[0],lat:fix.coordinate[1],accuracy:fix.accuracy??10000,heading:fix.heading??undefined,timestamp:fix.timestamp,vehicleType},now);
 return{fixTimestamp:fix.timestamp,checkedAt:now,validUntil:now+2000,coordinate:fix.coordinate,validForMeters:10,
  limit:result.status==='verified'?{status:'verified',speedLimitKmh:result.speedLimitKmh,segmentId:result.segmentId,confidence:result.confidence,units:'km/h'}:{status:'unknown',speedLimitKmh:null,reason:result.reason},
  notices:[],enforcementStatus:'unavailable/unverified'};
}
