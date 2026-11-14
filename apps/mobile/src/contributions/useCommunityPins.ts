import {useCallback,useEffect,useState} from 'react';
import {useFocusEffect} from 'expo-router';
import {AppState} from 'react-native';
import {useNetwork} from '../offline/network';
import {nearbyCommunityPins,type CommunityMapPin,type ApprovedContributionFeed} from './mapPins';

// Coarse area only. No device ID, saved route or movement trail is sent or persisted.
export function useApprovedContributionFeed(center:[number,number],enabled:boolean,interval=30000):ApprovedContributionFeed{
 const {status,lowData}=useNetwork();
 const lon=Math.round(center[0]*100)/100,lat=Math.round(center[1]*100)/100;
 const [snapshot,setSnapshot]=useState<{key:string;pins:CommunityMapPin[];checkedAt:number}|null>(null);
 const [now,setNow]=useState(()=>Date.now());
 const [foreground,setForeground]=useState(AppState.currentState==='active');
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const key=lon+','+lat;
 useFocusEffect(useCallback(()=>{
  if(!enabled||status==='offline'||lowData||lon< -4||lon>2||lat<4||lat>12)return;
  setForeground(AppState.currentState==='active');
  let alive=true,busy=false;let controller:AbortController|undefined;
  const refresh=async()=>{if(busy||AppState.currentState!=='active')return;busy=true;const request=new AbortController();controller=request;const timeout=setTimeout(()=>request.abort(),10000);try{const feed=await nearbyCommunityPins(lon,lat,request.signal);if(alive&&!request.signal.aborted)setSnapshot({key,...feed});}catch{if(alive)setSnapshot(null);}finally{clearTimeout(timeout);busy=false;}};
  void refresh();const timer=setInterval(()=>void refresh(),interval);
  const sub=AppState.addEventListener('change',s=>{setForeground(s==='active');setSnapshot(null);if(s==='active')void refresh();else controller?.abort();});
  return()=>{alive=false;clearInterval(timer);controller?.abort();sub.remove();};
 },[enabled,status,lowData,lon,lat,key,interval]));
 const fresh=enabled&&foreground&&status!=='offline'&&!lowData&&snapshot?.key===key&&now-snapshot.checkedAt<30000;
 return {pins:fresh?snapshot.pins.filter(p=>Date.parse(p.expiresAt)>now):[],checkedAt:fresh?snapshot.checkedAt:null,stale:!fresh};
}
export function useCommunityPins(center:[number,number],enabled:boolean){return useApprovedContributionFeed(center,enabled).pins;}
