import {encryptedStore} from '../privacy/vault';
import {vehicleClasses,type RoutingCoordinate,type VehicleClass} from '@rova/shared';
export type JourneyCheckpoint={destination:RoutingCoordinate;title:string;vehicleType:VehicleClass;savedAt:number;expiresAt:number};
export function validateJourneyCheckpoint(raw:unknown):{journey:JourneyCheckpoint|null}{
 const j=(raw as {journey:JourneyCheckpoint|null})?.journey;
 if(j===null)return {journey:null};
 if(!j||!Array.isArray(j.destination)||j.destination.length!==2||!j.destination.every(Number.isFinite)||Math.abs(j.destination[0])>180||Math.abs(j.destination[1])>90||typeof j.title!=='string'||j.title.length>200||!vehicleClasses.includes(j.vehicleType)||!Number.isFinite(j.savedAt)||!Number.isFinite(j.expiresAt)||j.expiresAt<=j.savedAt||j.expiresAt-j.savedAt>6*3600000)throw new Error('Invalid active journey checkpoint.');
 return {journey:{destination:[...j.destination],title:j.title,vehicleType:j.vehicleType,savedAt:j.savedAt,expiresAt:j.expiresAt}};
}
const store=encryptedStore('active-journey',()=>({journey:null}as {journey:JourneyCheckpoint|null}),validateJourneyCheckpoint,'rova-active-journey.json');
export async function saveJourneyCheckpoint(destination:RoutingCoordinate,title:string,vehicleType:VehicleClass){const savedAt=Date.now();await store.update(()=>({journey:{destination,title:title.slice(0,200),vehicleType,savedAt,expiresAt:savedAt+6*3600000}}));}
export async function loadJourneyCheckpoint(){await store.load();const j=store.read().journey;if(j&&(Date.now()>=j.expiresAt||Date.now()<j.savedAt-2000)){await store.erase();return null;}return j;}
let stop:()=>void=()=>{};
export function registerJourneyStopper(fn:()=>void){stop=fn;return()=>{if(stop===fn)stop=()=>{};};}
export async function eraseActiveJourney(){stop();await store.erase();}
export const clearJourneyCheckpoint=store.erase;
