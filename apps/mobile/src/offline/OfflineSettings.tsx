import {useEffect,useState} from 'react';
import {Switch,Text,View} from 'react-native';
import {router} from 'expo-router';
import * as Location from 'expo-location';
import {offlinePackState} from '@rova/shared';
import {Surface,ActionButton} from '../components/ui';
import {useRovaTheme} from '../theme/ThemeProvider';
import {useRoutePreview} from '../map/RouteProvider';
import {clearOfflineData,updateOfflineData,useOfflineData} from './data';
import {downloadSafetyPack} from './runtime';
import {useNetwork,setLowData} from './network';
export function OfflineSettings(){
 const d=useOfflineData(),network=useNetwork(),{theme}=useRovaTheme();const {setRoute,setSelectedRoutingOption,vehicleType}=useRoutePreview();
 const[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[now,setNow]=useState(Date.now);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);try{await work();}catch(e){setMessage(e instanceof Error?e.message:'Download failed. Previous data was kept.');}finally{setBusy(false);}}
 const saved=d.route,stale=saved&&(now>=saved.expiresAt||now<saved.savedAt-2000),packState=offlinePackState(d.safety,now);
 return <Surface style={{gap:12,marginBottom:18}}>
  <Text style={{fontSize:18,fontWeight:'800',color:theme.colors.ink}}>Offline & low data</Text>
  <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Text style={{color:theme.colors.ink}}>Low-data mode</Text><Switch accessibilityLabel="Low-data mode" value={network.lowData} disabled={busy} onValueChange={lowData=>{setLowData(lowData);void run(async()=>{await updateOfflineData(v=>({...v,lowData}));setMessage('Low-data preference saved.');});}}/></View>
  <Text style={{color:theme.colors.inkMuted}}>Save a selected Geoapify route in Compare routes before travelling. Only that route geometry and instructions are saved, encrypted on this phone. No offline route engine or live traffic is included.</Text>
  {saved&&<><Text style={{color:theme.colors.ink}}>{saved.title} | saved {new Date(saved.savedAt).toLocaleString()}{stale?' | Data may be outdated. Refresh online before starting.':''}</Text>
   <ActionButton title="Resume saved route" disabled={busy||!!stale} onPress={()=>{
    const r=saved;setSelectedRoutingOption(r.option);setRoute({origin:r.origin,destination:r.destination,geometry:r.option.geometry,distanceMeters:r.option.distanceMeters,durationSeconds:r.option.durationSeconds,trafficAware:false,originIsLive:true,originLabel:'Saved route start',destinationLabel:r.title,release:()=>{},startGuidance:async()=>{throw new Error('Use ROVA saved-route guidance.');}});router.push('/navigation');
   }}/></>}
  <Text style={{color:theme.colors.inkMuted}}>Offline safety: {packState==='stale'?'Data may be outdated. Speed warnings are unavailable until refreshed.':packState==='missing'?'No approved dataset downloaded.':`${d.safety!.roads.filter(r=>r.record.rules.length>0).length} approved segments; expires ${new Date(d.safety!.expiresAt).toLocaleString()}.`}</Text>
  <Text style={{color:theme.colors.inkMuted}}>A download covers approximately 2 km around your current location for the selected vehicle. Road signs take priority; offline changes/revocations cannot be received until you reconnect. Downloads require preapproved sources and can be unavailable.</Text>
  <ActionButton title="Download approved nearby safety data" secondary disabled={busy||network.status==='offline'} onPress={()=>{void run(async()=>{setMessage('Downloading...');const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error('Location permission is needed to choose the download area.');const fix=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});const count=await downloadSafetyPack(fix.coords.longitude,fix.coords.latitude,vehicleType);setMessage(count?`${count} approved road segments saved.`:'No approved speed-limit coverage in this dataset. Limits remain unavailable.');});}}/>
  <Text style={{color:theme.colors.inkMuted}}>Recently viewed Mapbox tiles use the provider-managed cache only; a complete offline map is not guaranteed. No bulk region downloads or third-party tile scraping. Keep attribution visible.</Text>
  <ActionButton title="Delete offline route and safety downloads" secondary disabled={busy} onPress={()=>{void run(async()=>{await clearOfflineData();setMessage('Offline downloads deleted.');});}}/>
  {!!d.error&&<Text style={{color:theme.colors.inkMuted}}>{d.error}</Text>}
  {!!message&&<Text accessibilityLiveRegion="polite" style={{color:theme.colors.inkMuted}}>{message}</Text>}
 </Surface>;
}
