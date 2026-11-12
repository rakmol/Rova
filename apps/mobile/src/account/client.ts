import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { clearAccountPlaces, type SavedPlace, validateLocal, type Preferences } from './local';
const host=Constants.expoConfig?.hostUri;
const tunnel=__DEV__&&host&&['.exp.direct','.on.expo.app','.ngrok-free.app'].some(s=>host.endsWith(s))?`https://${host}/rova-api`:undefined;
const base=process.env.EXPO_PUBLIC_ACCOUNT_API_URL||tunnel;
type Session={accessToken:string;refreshToken:string;expiresAt:number};
// Auth tokens deliberately stay in memory: no credentials in files or logs, guest is always available.
let session:Session|null=null;let generation=0;let refreshing:Promise<void>|null=null;
const listeners=new Set<()=>void>();
const notify=()=>listeners.forEach(fn=>fn());
export function useDriverSession(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>session,()=>null);}
async function request(path:string,body?:unknown,token?:string){
  if(!base)throw new Error('Optional sign-in is not connected. You can continue as a guest.');
  const url=new URL(base);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Account requests require HTTPS.');
  const response=await fetch(`${base.replace(/\/$/,'')}${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(response.status===503?'Optional sign-in is not available yet. Guest navigation still works.':response.status===401?'Sign-in expired or the code is invalid. Please sign in again.':response.status===403?'This account is unavailable. Continue as a guest.':response.status===429?'Too many attempts. Please wait before trying again.':'Account request failed. Please try again.');
  return response.json();
}
function parseSession(s:Session){if(!s||typeof s.accessToken!=='string'||s.accessToken.length<20||typeof s.refreshToken!=='string'||!s.refreshToken.length||!Number.isFinite(s.expiresAt)||s.expiresAt<=Date.now())throw new Error('Invalid sign-in response.');return{accessToken:s.accessToken,refreshToken:s.refreshToken,expiresAt:s.expiresAt};}
export const accountStatus=()=>request('/v1/auth/status') as Promise<{enabled:boolean}>;
export const sendCode=(email:string)=>request('/v1/auth/code',{email:email.trim()});
export async function verifyCode(email:string,code:string){const current=generation;const next=parseSession(await request('/v1/auth/verify',{email:email.trim(),code:code.trim()}));if(generation!==current)return;session=next;notify();}
async function token(){
  if(!session)throw new Error('Sign in to access your account.');
  if(session.expiresAt<Date.now()+30000){
    if(!refreshing){const current=generation,old=session;refreshing=(async()=>{try{const next=parseSession(await request('/v1/auth/refresh',{refreshToken:old.refreshToken}));if(generation===current){session=next;notify();}}catch(e){if(generation===current){session=null;notify();await clearAccountPlaces();}throw e;}finally{refreshing=null;}})();}
    await refreshing;
  }
  if(!session)throw new Error('Please sign in again.');return session.accessToken;
}
export async function signOut(){const previous=session;generation++;session=null;notify();await clearAccountPlaces();if(previous){try{await request('/v1/auth/sign-out',{},previous.accessToken);}catch{throw new Error('Signed out on this phone. Could not revoke other sessions; retry after reconnecting.');}}}
export async function accountData(){const current=generation;const data=await request('/v1/me',undefined,await token());if(generation!==current||!session)throw new Error('Account changed. Please try again.');const validated=validateLocal({preferences:data.preferences,places:data.places});if(typeof data.id!=='string'||data.role!=='driver')throw new Error('Invalid account response.');return{id:data.id,...validated};}
export async function backupAccount(places:SavedPlace[],preferences:Preferences){const normalized=validateLocal({places,preferences});return request('/v1/me/sync',{places:normalized.places.map(({owner:_owner,...p})=>p),preferences:normalized.preferences},await token());}
export const eraseAccountData=async()=>request('/v1/me/erase-data',{},await token());
export async function deleteAccount(){const result=await request('/v1/me/delete-account',{confirm:'DELETE'},await token());generation++;session=null;notify();await clearAccountPlaces();return result as {providerDeletion:'complete'|'queued'};}
