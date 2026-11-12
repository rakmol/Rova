import type {VehicleClass} from './index';
import {evaluateSpeedLimit,unknownSpeedLimit,type RoadCandidate,type SafetyFix} from './speed-limit';
import {metres,projectOnPath,type ComplianceCoordinate} from './compliance';
export interface OfflineSafetyPack {
 schema:1; version:string; complete:true; createdAt:number; expiresAt:number;
 bounds:[number,number,number,number]; vehicleType:VehicleClass;
 roads:{geometry:ComplianceCoordinate[];record:RoadCandidate}[];
 attribution:string;
}
export const OFFLINE_SAFETY_TTL=6*3600000;
export function validateSafetyPack(raw:unknown):OfflineSafetyPack {
 const p=raw as OfflineSafetyPack;
 if(!p||p.schema!==1||p.complete!==true||!/^sha256:[a-f0-9]{64}$/.test(p.version)||!Number.isFinite(p.createdAt)||!Number.isFinite(p.expiresAt)||p.expiresAt<=p.createdAt||p.expiresAt-p.createdAt>OFFLINE_SAFETY_TTL
  ||!['private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle'].includes(p.vehicleType)||typeof p.attribution!=='string'
  ||!Array.isArray(p.bounds)||p.bounds.length!==4||!p.bounds.every(Number.isFinite)||p.bounds[0]>=p.bounds[2]||p.bounds[1]>=p.bounds[3]||p.bounds[0]<-4||p.bounds[2]>2||p.bounds[1]<4||p.bounds[3]>12
  ||p.bounds[2]-p.bounds[0]>.021||p.bounds[3]-p.bounds[1]>.021||!Array.isArray(p.roads)||p.roads.length>64)throw new Error('Incomplete or incompatible offline safety download.');
 let vertices=0;
 for(const road of p.roads){
  const r=road?.record;
  if(!r||typeof r.id!=='string'||typeof r.synthetic!=='boolean'||!Array.isArray(r.rules)||r.rules.length>17||!Array.isArray(road.geometry)||road.geometry.length<2||road.geometry.length>20000)throw new Error('Invalid offline road.');
  vertices+=road.geometry.length;
  if(vertices>40000||road.geometry.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||Math.abs(v[0])>180||Math.abs(v[1])>90))throw new Error('Invalid offline geometry.');
 }
 return p;
}
export function offlinePackState(p:OfflineSafetyPack|null,now:number){return !p?'missing':now<p.createdAt-2000||now>=p.expiresAt?'stale':'ready';}
export function offlineSpeedLimit(p:OfflineSafetyPack|null,fix:SafetyFix,now:number){
 if(!p||offlinePackState(p,now)!=='ready'||p.vehicleType!==fix.vehicleType)return unknownSpeedLimit('service_unavailable');
 const [w,s,e,n]=p.bounds;
 // Keep a 110 m guard band: no numeric match when unexported parallel roads might be nearby.
 if(fix.lon<=w||fix.lon>=e||fix.lat<=s||fix.lat>=n||Math.min(metres([fix.lon,fix.lat],[w,fix.lat]),metres([fix.lon,fix.lat],[e,fix.lat]),metres([fix.lon,fix.lat],[fix.lon,s]),metres([fix.lon,fix.lat],[fix.lon,n]))<110)return unknownSpeedLimit('no_road_match');
 try{
  const candidates:RoadCandidate[]=[];
  for(const road of p.roads){const match=projectOnPath([fix.lon,fix.lat],road.geometry);if(!match||match.distance>100)continue;
   if(match.ambiguous)return unknownSpeedLimit('ambiguous_junction');
   candidates.push({...road.record,distanceMeters:match.distance,bearing:match.heading,endpointMeters:Math.min(metres([fix.lon,fix.lat],road.geometry[0]),metres([fix.lon,fix.lat],road.geometry[road.geometry.length-1]))});
  }
  return evaluateSpeedLimit(fix,candidates,now);
 }catch{return unknownSpeedLimit('service_unavailable');}
}
