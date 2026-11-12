import Constants from 'expo-constants';
import {requireOptionalNativeModule} from 'expo-modules-core';
import {AppState} from 'react-native';
import {encryptedStore} from '../privacy/vault';
import {emptyDiagnostics,validateDiagnostics,observeFatal,type FatalGuard} from './model';
import {androidExitCounts} from './native';
import {createPilotRuntime} from './engine';
const host=Constants.expoConfig?.hostUri;
export const pilotEndpoint=process.env.EXPO_PUBLIC_PILOT_API_URL||(__DEV__&&host&&['.exp.direct','.on.expo.app','.ngrok-free.app'].some(s=>host.endsWith(s))?`https://${host}/rova-api/v1/pilot`:undefined);
export const diagnosticStore=encryptedStore('pilot-v1',emptyDiagnostics,validateDiagnostics,'rova-pilot-unused-legacy.json');
async function request(endpoint:string,path:string,body:unknown,token?:string,signal?:AbortSignal){const u=new URL(endpoint);if(u.username||u.password||u.search||u.hash||(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Diagnostics require a secure endpoint.');const abort=new AbortController(),cancel=()=>abort.abort();if(signal?.aborted)abort.abort();signal?.addEventListener('abort',cancel);const timer=setTimeout(cancel,12000);try{const r=await fetch(endpoint.replace(/\/$/,'')+path,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),signal:abort.signal});if(!r.ok)throw Error('Diagnostic request unavailable.');return await r.json();}finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}}
function uuid(){if(!requireOptionalNativeModule('ExpoCrypto'))throw Error('Updated app required for diagnostic receipts.');
 // eslint-disable-next-line @typescript-eslint/no-require-imports -- Old APKs must not load an unavailable native module at startup.
 return (require('expo-crypto') as typeof import('expo-crypto')).randomUUID();}
export const pilotRuntime=createPilotRuntime({store:diagnosticStore,endpoint:pilotEndpoint,now:Date.now,uuid,exits:androidExitCounts,request});
export const erasePilotData=()=>pilotRuntime.withdraw();
export function startPilotLifecycle(){let alive=true,restore=()=>{};void pilotRuntime.start().then(()=>{if(alive)restore=observeFatal((globalThis as typeof globalThis&{ErrorUtils?:FatalGuard}).ErrorUtils,()=>pilotRuntime.record('js_fatal'));}).catch(()=>{});const app=AppState.addEventListener('change',()=>{void pilotRuntime.flush();}),timer=setInterval(()=>{void pilotRuntime.flush();},1800000);return()=>{alive=false;restore();app.remove();clearInterval(timer);};}
