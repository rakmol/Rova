import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {AppState,Text,View} from 'react-native';
import {router,usePathname,useRootNavigationState} from 'expo-router';
import * as Location from 'expo-location';
import type {RoutingCoordinate,RoutingOption,VehicleClass} from '@rova/shared';
import {useNavigationSession} from './useNavigationSession';
import {useRoutePreview} from '../map/RouteProvider';
import {routingProvider} from '../routing/runtime';
import {clearJourneyCheckpoint,loadJourneyCheckpoint,registerJourneyStopper,saveJourneyCheckpoint} from './journey-checkpoint';
import {ActionButton} from '../components/ui';
import {useRovaTheme} from '../theme/ThemeProvider';
type Request={destination:RoutingCoordinate;selected:RoutingOption|null;vehicleType:VehicleClass;title:string};
type Value=ReturnType<typeof useNavigationSession>&{begin(request:Request):void};
const Context=createContext<Value|null>(null);

/** Root ownership survives navigation-screen unmounts and Android app switching. */
export function ActiveNavigationProvider({children}:{children:ReactNode}){
 const {setRoute,setSelectedRoutingOption,setVehicleType}=useRoutePreview();
 const {theme}=useRovaTheme();const root=useRootNavigationState(),pathname=usePathname();
 const [request,setRequest]=useState<Request|null>(null),[recovering,setRecovering]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[openRecovered,setOpenRecovered]=useState(false);
 const requested=useRef<Request|null>(null),loaded=useRef(false);
 const recoveryGeneration=useRef(0),recoveryAbort=useRef<AbortController|null>(null);
 const session=useNavigationSession(request?.destination,request?.selected??null,request?.vehicleType??'private_car');
 const stopRef=useRef(session.stop),openedRecovery=useRef(false);
 useEffect(()=>{stopRef.current=session.stop;},[session.stop]);
 const end=useCallback(()=>{recoveryGeneration.current++;recoveryAbort.current?.abort();setRecovering(false);stopRef.current();requested.current=null;setRequest(null);setError('');void clearJourneyCheckpoint().catch(()=>{});},[]);
 useEffect(()=>registerJourneyStopper(end),[end]);
 const begin=useCallback((next:Request)=>{
  const current=requested.current;
  if(current&&current.destination.every((n,i)=>n===next.destination[i])&&current.selected?.id===next.selected?.id&&current.vehicleType===next.vehicleType)return;
  recoveryGeneration.current++;recoveryAbort.current?.abort();
  stopRef.current();requested.current=next;setRequest(next);setError('');
  void saveJourneyCheckpoint(next.destination,next.title,next.vehicleType).catch(()=>{if(requested.current===next)setError('Journey recovery could not be saved securely. Keep ROVA open.');});
 },[]);
 useEffect(()=>{if(session.snapshot.state==='arrived')void clearJourneyCheckpoint().catch(()=>{});},[session.snapshot.state]);
 useEffect(()=>{
  let active=true,work:AbortController|null=null;
  const restore=async()=>{
   if(loaded.current||requested.current||AppState.currentState!=='active')return;
   loaded.current=true;
   const generation=recoveryGeneration.current;
   try{
    const saved=await loadJourneyCheckpoint();if(!saved||!active||requested.current||generation!==recoveryGeneration.current)return;
    setRecovering(true);
    const permission=await Location.getForegroundPermissionsAsync();if(!permission.granted)throw new Error('Allow location in phone settings, then resume your previous journey.');
    const controller=new AbortController();work=controller;recoveryAbort.current=controller;let timer:ReturnType<typeof setTimeout>|undefined;
    const location=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.BestForNavigation}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('GPS is taking too long. Retry recovering the journey.')),20000);})]).finally(()=>clearTimeout(timer));
    if(!active||requested.current||generation!==recoveryGeneration.current)return;
    const origin:RoutingCoordinate=[location.coords.longitude,location.coords.latitude];
    const timeout=setTimeout(()=>controller.abort(),20000);
    const response=await routingProvider.routes(origin,saved.destination,controller.signal).finally(()=>clearTimeout(timeout));
    const option=response.routes.find(r=>!r.isSample&&r.maneuvers.some(m=>m.geometryIndex!==undefined));
    if(!option)throw new Error('Reconnect to recover your route. The active destination has been kept.');
    if(!active||requested.current||generation!==recoveryGeneration.current)return;
    setRoute({origin,destination:saved.destination,geometry:option.geometry,distanceMeters:option.distanceMeters,durationSeconds:option.durationSeconds,trafficAware:false,originIsLive:true,originLabel:'Current position',destinationLabel:saved.title,release:()=>{},startGuidance:async()=>{throw new Error('Use the ROVA navigation session.');}});
    setSelectedRoutingOption(option);setVehicleType(saved.vehicleType);begin({destination:saved.destination,selected:option,vehicleType:saved.vehicleType,title:saved.title});setOpenRecovered(true);
   }catch{if(active&&!requested.current&&generation===recoveryGeneration.current)setError('Your active destination is kept. Reconnect and check GPS, then resume the journey.');}
   finally{if(active)setRecovering(false);}
  };
  void restore();const listener=AppState.addEventListener('change',s=>{if(s==='active')void restore();});
  return()=>{active=false;work?.abort();listener.remove();};
 },[begin,retry,setRoute,setSelectedRoutingOption,setVehicleType]);
 useEffect(()=>{if(openRecovered&&root?.key&&!openedRecovery.current){openedRecovery.current=true;router.replace('/navigation');}},[openRecovered,root?.key]);
 const returnToJourney=request&&pathname!=='/navigation'&&!recovering&&!error&&['navigating','off-route','rerouting'].includes(session.snapshot.state);
 return <Context.Provider value={{...session,stop:end,begin}}>{children}{returnToJourney&&<View style={{position:'absolute',bottom:85,left:20,right:20}}><ActionButton title="Return to navigation" onPress={()=>router.push('/navigation')}/></View>}{(recovering||error)&&<View style={{position:'absolute',top:45,left:12,right:12,padding:12,gap:8,backgroundColor:theme.colors.surface,borderRadius:16}}><Text accessibilityLiveRegion="polite" style={{color:theme.colors.ink}}>{recovering?'Recovering your active journey…':error}</Text>{!recovering&&<><ActionButton title="Resume previous journey" onPress={()=>{loaded.current=false;setError('');setRetry(n=>n+1);}}/><ActionButton title="End previous journey" secondary onPress={end}/></>}</View>}</Context.Provider>;
}
export function useActiveNavigation(destination:RoutingCoordinate|undefined,selected:RoutingOption|null,vehicleType:VehicleClass){
 const value=useContext(Context),{route}=useRoutePreview();
 if(!value)throw new Error('ActiveNavigationProvider is required.');
 const begin=value.begin,title=route?.destinationLabel??'Destination',lon=destination?.[0],lat=destination?.[1];
 useEffect(()=>{if(lon!==undefined&&lat!==undefined)begin({destination:[lon,lat],selected,vehicleType,title});},[begin,lon,lat,selected,vehicleType,title]);
 return value;
}
