import { reportingRequest } from '../incidents/client';
export type CommunityMapPin={id:string;kind:'place'|'fixed_camera'|'hazard';name:string;category:string;direction:string;coordinate:[number,number];expiresAt:string;reviewedAt:string|null;authorityVerified:false;evidence:'community'};
export function parseCommunityPins(value:unknown,now=Date.now()):CommunityMapPin[]{
 const data=value as {pins?:CommunityMapPin[];authorityVerified?:boolean;checkedAt?:string};
 if(data?.authorityVerified!==false||!Array.isArray(data.pins)||data.pins.length>100||!Number.isFinite(Date.parse(data.checkedAt??''))||Math.abs(now-Date.parse(data.checkedAt!))>60000)throw new Error('Invalid community map update.');
 for(const pin of data.pins)if(!pin||typeof pin.id!=='string'||typeof pin.name!=='string'||pin.name.length>120||!['place','fixed_camera','hazard'].includes(pin.kind)||pin.authorityVerified!==false||pin.evidence!=='community'||!Array.isArray(pin.coordinate)||pin.coordinate.length!==2||!pin.coordinate.every(Number.isFinite)||pin.coordinate[0]<-4||pin.coordinate[0]>2||pin.coordinate[1]<4||pin.coordinate[1]>12||!Number.isFinite(Date.parse(pin.expiresAt))||(pin.kind!=='hazard'&&!Number.isFinite(Date.parse(pin.reviewedAt??''))))throw new Error('Invalid community map pin.');
 return data.pins.filter(pin=>Date.parse(pin.expiresAt)>now);
}
export async function nearbyCommunityPins(lon:number,lat:number,signal:AbortSignal){
 return parseCommunityPins(await reportingRequest(`/contributions/nearby?lon=${lon}&lat=${lat}`,'GET',undefined,undefined,signal));
}
