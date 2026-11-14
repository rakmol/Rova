import { reportingRequest } from '../incidents/client';
export type CommunityMapPin={id:string;kind:'place'|'fixed_camera'|'hazard';name:string;category:string;direction:string;coordinate:[number,number];expiresAt:string;reviewedAt:string|null;rovaVerified:true;revision:number;approximateRadiusMeters:number|null;authorityVerified:false;evidence:'community'};
export type ApprovedContributionFeed={pins:CommunityMapPin[];checkedAt:number|null;stale:boolean};
export function parseCommunityPins(value:unknown,now=Date.now()):CommunityMapPin[]{
 const data=value as {pins?:CommunityMapPin[];authorityVerified?:boolean;checkedAt?:string};
 if(data?.authorityVerified!==false||!Array.isArray(data.pins)||data.pins.length>100||!Number.isFinite(Date.parse(data.checkedAt??''))||Math.abs(now-Date.parse(data.checkedAt!))>60000)throw new Error('Invalid community map update.');
 for(const pin of data.pins)if(!pin||typeof pin.id!=='string'||typeof pin.name!=='string'||pin.name.length>120||!['place','fixed_camera','hazard'].includes(pin.kind)||pin.authorityVerified!==false||pin.evidence!=='community'||!Array.isArray(pin.coordinate)||pin.coordinate.length!==2||!pin.coordinate.every(Number.isFinite)||pin.coordinate[0]<-4||pin.coordinate[0]>2||pin.coordinate[1]<4||pin.coordinate[1]>12||!Number.isFinite(Date.parse(pin.expiresAt))||(pin.kind!=='hazard'&&!Number.isFinite(Date.parse(pin.reviewedAt??''))))throw new Error('Invalid community map pin.');
 for(const pin of data.pins){
  const categories=pin.kind==='place'?['landmark','market','business','junction','other']:pin.kind==='fixed_camera'?['fixed_speed','red_light','unknown']:['pothole','flood','collision','closure','congestion','obstacle'];
  if(pin.rovaVerified!==true||!Number.isInteger(pin.revision)||pin.revision<1||!categories.includes(pin.category)||typeof pin.direction!=='string'||pin.direction.length>120||/[\p{Cc}]/u.test(pin.name)
   ||(pin.kind==='hazard'?pin.approximateRadiusMeters!==150:pin.approximateRadiusMeters!==null))throw new Error('Invalid ROVA verification.');
 }
 return data.pins.filter(pin=>Date.parse(pin.expiresAt)>now);
}
export async function nearbyCommunityPins(lon:number,lat:number,signal:AbortSignal){
 const data=await reportingRequest(`/contributions/nearby?lon=${lon}&lat=${lat}`,'GET',undefined,undefined,signal);
 return {pins:parseCommunityPins(data),checkedAt:Date.parse((data as {checkedAt:string}).checkedAt)};
}
