/* eslint-disable @typescript-eslint/no-require-imports -- Guard the optional native task manager on older APKs. */
import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo-modules-core';
import * as Location from 'expo-location';
const name='rova-active-navigation-location';
type Listener=(location:Location.LocationObject)=>void;
const listeners=new Set<Listener>();
let lastListenerAt=Date.now();
const task=requireOptionalNativeModule('ExpoTaskManager')?require('expo-task-manager') as typeof import('expo-task-manager'):null;
if(task&&!task.isTaskDefined(name))task.defineTask<{locations:Location.LocationObject[]}>(name,async({data,error})=>{
 if(error||!data?.locations)return;
 if(!listeners.size&&Date.now()-lastListenerAt>60000){await stopBackgroundNavigation().catch(()=>{});return;}
 // No coordinates are written or uploaded by this task. Reject deferred old batches.
 for(const location of [...data.locations].sort((a,b)=>a.timestamp-b.timestamp)){
  if(Date.now()-location.timestamp>10000||location.timestamp>Date.now()+2000)continue;
  for(const listener of listeners)listener(location);
 }
});
export async function backgroundPermission(){
 if(!task||Platform.OS==='web')return false;
 try{return (await Location.getBackgroundPermissionsAsync()).granted;}catch{return false;}
}
export async function enableBackgroundNavigation(){
 if(!task||Platform.OS==='web')throw new Error('Install the updated Android app for background navigation.');
 const foreground=await Location.requestForegroundPermissionsAsync();
 if(!foreground.granted)throw new Error('Location permission is needed for navigation.');
 const permission=await Location.requestBackgroundPermissionsAsync();
 if(!permission.granted)throw new Error('Choose “Allow all the time” in ROVA location permissions to continue navigation outside the app.');
}
let operation=Promise.resolve();
export async function stopBackgroundNavigation(){
 const work=operation.catch(()=>{}).then(async()=>{if(task&&await Location.hasStartedLocationUpdatesAsync(name))await Location.stopLocationUpdatesAsync(name);});
 operation=work;await work;
}
export async function startBackgroundNavigation(listener:Listener):Promise<{remove():void}|null>{
 if(!await backgroundPermission())return null;
 listeners.add(listener);
 lastListenerAt=Date.now();
 const work=operation.catch(()=>{}).then(async()=>{
  if(!await Location.hasStartedLocationUpdatesAsync(name))await Location.startLocationUpdatesAsync(name,{
   accuracy:Location.Accuracy.BestForNavigation,timeInterval:1000,distanceInterval:0,deferredUpdatesInterval:1000,pausesUpdatesAutomatically:false,showsBackgroundLocationIndicator:true,
   foregroundService:{notificationTitle:'ROVA navigation is active',notificationBody:'Tap to return to your journey. End navigation in ROVA to stop location use.',notificationColor:'#087F78',killServiceOnDestroy:false},
  });
 });operation=work;
 try{await work;}catch{listeners.delete(listener);return null;}
 return {remove:()=>{listeners.delete(listener);if(!listeners.size)void stopBackgroundNavigation().catch(()=>{});}};
}
