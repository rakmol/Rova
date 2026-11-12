import {AppState} from 'react-native';
import * as Location from 'expo-location';
import {drivingSnapshot,subscribeDriving,observeMotion,resetPassenger} from './driving';
/** Foreground only, permission already granted. Navigation supplies its own higher-quality fixes. */
export function startDrivingMonitor(){
 let active=true,foreground=AppState.currentState==='active',previous:boolean|undefined,generation=0;
 let watch:Location.LocationSubscription|undefined;
 function reconcile(){const desired=active&&foreground&&!drivingSnapshot().navigation;if(desired===previous)return;previous=desired;const current=++generation;watch?.remove();watch=undefined;if(!desired)return;
  void Location.getForegroundPermissionsAsync().then(async permission=>{
   if(!active||current!==generation||!permission.granted)return;
   const sub=await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:3000,distanceInterval:0},p=>{if(active&&current===generation)observeMotion({speed:p.coords.speed,accuracy:p.coords.accuracy,timestamp:p.timestamp});});
   if(!active||current!==generation)sub.remove();else watch=sub;
  }).catch(()=>{});
 }
 const app=AppState.addEventListener('change',s=>{foreground=s==='active';if(!foreground)resetPassenger();reconcile();});
 const unsubscribe=subscribeDriving(reconcile);reconcile();
 return()=>{active=false;generation++;watch?.remove();app.remove();unsubscribe();resetPassenger();};
}
