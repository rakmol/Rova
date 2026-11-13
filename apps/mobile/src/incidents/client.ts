import Constants from 'expo-constants';
import {credentialStore} from '../privacy/vault';
import { Platform } from 'react-native';
import type { CommunityIncident, IncidentCategory } from '@rova/shared';
export type IncidentFix = { lon:number;lat:number;accuracy:number;timestamp:number;speed:number|null };
export type SafeInteraction = 'parked' | 'passenger';
const host=Constants.expoConfig?.hostUri;
const tunnel=__DEV__&&host&&['.exp.direct','.on.expo.app','.ngrok-free.app'].some(s=>host.endsWith(s))?`https://${host}/rova-api/incidents`:undefined;
export const incidentEndpoint=process.env.EXPO_PUBLIC_INCIDENTS_API_URL||tunnel;
const endpoint=incidentEndpoint;
let sessionPromise:Promise<string>|undefined;
let sessionToken:string|undefined;
type StoredSession={token:string;endpoint:string;expiresAt:string};
const credentials=credentialStore<StoredSession>('reporting','rova-reporting-session.json',raw=>{const v=raw as StoredSession;if(!v||typeof v.endpoint!=='string'||!/^https?:\/\//.test(v.endpoint)||!/^[a-f0-9]{64}$/.test(v.token)||!Number.isFinite(Date.parse(v.expiresAt)))throw new Error('Invalid reporting credential.');return{token:v.token,endpoint:v.endpoint,expiresAt:v.expiresAt};});
export function approximateFix(f:IncidentFix) {return {lon:Math.round(f.lon*1000)/1000,lat:Math.round(f.lat*1000)/1000,accuracy:f.accuracy,timestamp:f.timestamp};}
export function canInteract(mode:SafeInteraction|null,f:IncidentFix,now=Date.now()) {
  return !!mode&&Number.isFinite(f.accuracy)&&f.accuracy>0&&f.accuracy<=50&&now-f.timestamp<=60000&&f.timestamp<=now+5000
    &&Number.isFinite(f.lon)&&Number.isFinite(f.lat)&&f.lon>=-4&&f.lon<=2&&f.lat>=4&&f.lat<=12
    &&(mode==='passenger'||(f.speed!==null&&Number.isFinite(f.speed)&&f.speed>=0&&f.speed<1.4));
}
export class IncidentRequestError extends Error {constructor(message:string,readonly status:number){super(message);}}
export async function reportingRequest(path:string,method='GET',body?:unknown,token?:string,signal?:AbortSignal):Promise<unknown> {
  if(!endpoint)throw new Error('Road reporting is not connected.');
  const base=new URL(endpoint);if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('Reporting requires a secure connection.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try {
    const r=await fetch(`${endpoint.replace(/\/$/,'')}${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
    if(!r.ok){if(r.status===401){sessionToken=undefined;await credentials.erase();}
      throw new IncidentRequestError(r.status===409?'This report changed, expired, or already has your vote. Refresh the list.':r.status===429?'Too many reports or votes. Try again later.':r.status===401?'Reporting session expired. Please try again.':'Could not complete the request. Try again when connected.',r.status);}
    return await r.json();
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
const request=reportingRequest;
export async function incidentSession():Promise<string> {
  if(sessionToken)return sessionToken;
  if(sessionPromise)return sessionPromise;
  sessionPromise=(async()=>{
    const value=await credentials.read();if(value&&value.endpoint===endpoint&&Date.parse(value.expiresAt)>Date.now()+60000)return sessionToken=value.token;
    const data=await request('/session','POST',{platform:Platform.OS==='ios'?'ios':Platform.OS==='web'?'web':'android'}) as {token:string;expiresAt:string};
    if(!/^[a-f0-9]{64}$/.test(data.token)||!Number.isFinite(Date.parse(data.expiresAt)))throw new Error('Invalid reporting session.');
    await credentials.write({...data,endpoint:endpoint!});sessionToken=data.token;return data.token;
  })();try{return await sessionPromise;}finally{sessionPromise=undefined;}
}
function validateReports(value:unknown):CommunityIncident[] {
  const reports=(value as {reports?:unknown})?.reports;
  if(!Array.isArray(reports)||reports.length>50)throw new Error('Invalid incident response.');
  for(const r of reports)if(!r||typeof r.id!=='string'||!['pothole','flood','collision','closure','congestion','obstacle'].includes(r.category)||!['pending','verified'].includes(r.status)
    ||r.evidence!=='community'||r.authorityVerified!==false||!Array.isArray(r.coordinate)||r.coordinate.length!==2||!r.coordinate.every(Number.isFinite)
    ||r.coordinate[0]<-4||r.coordinate[0]>2||r.coordinate[1]<4||r.coordinate[1]>12
    ||!Number.isInteger(r.confirmations)||r.confirmations<0||!Number.isInteger(r.notThere)||r.notThere<0||!Number.isInteger(r.revision)||r.revision<1
    ||!Number.isFinite(r.approximateRadiusMeters)||r.approximateRadiusMeters<100||r.approximateRadiusMeters>1000||!Number.isFinite(r.confidence)||r.confidence<0||r.confidence>1
    ||!Number.isFinite(Date.parse(r.reportedAt))||!Number.isFinite(Date.parse(r.expiresAt)))throw new Error('Invalid incident response.');
  return reports;
}
export async function nearbyIncidents(f:IncidentFix):Promise<CommunityIncident[]> {
  const p=approximateFix(f);return validateReports(await request(`/nearby?lon=${p.lon}&lat=${p.lat}&radius=2000`,'GET',undefined,await incidentSession()));
}
export async function submitIncident(category:IncidentCategory,f:IncidentFix,interaction:SafeInteraction,note?:string):Promise<{id:string;duplicate:boolean}> {
  if(!canInteract(interaction,f))throw new Error('Park safely or ask a passenger. A fresh, accurate location is required.');
  return await request('','POST',{category,fix:approximateFix(f),interaction,...(note?.trim()?{note:note.trim()}:{})},await incidentSession()) as {id:string;duplicate:boolean};
}
export async function voteIncident(id:string,decision:'confirm'|'not_there',f:IncidentFix,interaction:SafeInteraction) {
  if(!canInteract(interaction,f))throw new Error('Park safely or ask a passenger. A fresh, accurate location is required.');
  await request(`/${encodeURIComponent(id)}/votes`,'POST',{decision,fix:approximateFix(f),interaction},await incidentSession());
}
export async function approvedHazards(lon:number,lat:number,signal?:AbortSignal) {
  return request(`/approved?lon=${lon}&lat=${lat}`,'GET',undefined,await incidentSession(),signal);
}
export async function clearIncidentSession() {sessionToken=undefined;await credentials.erase();}
export async function eraseReportingData():Promise<void>{
  let token=sessionToken;
  if(!token){const value=await credentials.read();if(value&&value.endpoint===endpoint)token=value.token;}
  if(!token)return;
  await request('/erase-device','POST',{},token);await clearIncidentSession();
}
