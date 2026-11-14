import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState} from 'react-native';
import {useNetwork} from '../offline/network';
import {nearbyCommunityPins,type CommunityMapPin} from './mapPins';

// Coarse area only. No device ID, saved route or movement trail is sent or persisted.
export function useCommunityPins(center:[number,number],enabled:boolean){
 const {status,lowData}=useNetwork();
 const lon=Math.round(center[0]*100)/100,lat=Math.round(center[1]*100)/100;
 const [snapshot,setSnapshot]=useState<{key:string;pins:CommunityMapPin[];checkedAt:number}|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const key=lon+','+lat;
 useFocusEffect(useCallback(()=>{
  if(!enabled||status==='offline'||lowData||lon< -4||lon>2||lat<4||lat>12)return;
  let alive=true,busy=false;let controller:AbortController|undefined;
  const refresh=async()=>{if(busy||AppState.currentState!=='active')return;busy=true;controller=new AbortController();try{const pins=await nearbyCommunityPins(lon,lat,controller.signal);if(alive)setSnapshot({key,pins,checkedAt:Date.now()});}catch{if(alive)setSnapshot(null);}finally{busy=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),30000);
  const sub=AppState.addEventListener('change',s=>{if(s==='active')void refresh();else controller?.abort();});
  return()=>{alive=false;clearInterval(timer);controller?.abort();sub.remove();};
 },[enabled,status,lowData,lon,lat,key]));
 return enabled&&status!=='offline'&&snapshot?.key===key&&now-snapshot.checkedAt<60000?snapshot.pins.filter(p=>Date.parse(p.expiresAt)>now):[];
}
