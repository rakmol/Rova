import {tx} from "../i18n";
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Switch, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { ActionButton, Surface } from '../components/ui';
import { useRovaTheme } from '../theme/ThemeProvider';
import { driverStorageStatus, updateDriverData, useDriverData } from './local';
import {erasePhoneData} from '../privacy/erase';
import { readHistory, writeHistory, useHistory } from '../places/history';
import { placesProvider } from '../places/runtime';
import { eraseReportingData } from '../incidents/client';
import { useRoutePreview } from '../map/RouteProvider';
export function DriverSettings(){
  const data=useDriverData();const {theme}=useRovaTheme();const ink={color:theme.colors.ink};const muted={color:theme.colors.inkMuted};
  const {setRoute,setPickedDestination,setSelectedRoutingOption}=useRoutePreview();
  const [permission,setPermission]=useState('Not checked');const history=useHistory();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;const check=()=>{void Location.getForegroundPermissionsAsync().then(p=>{if(active)setPermission(p.granted?'Allowed':p.canAskAgain?'Not allowed':'Not allowed — change in phone settings');}).catch(()=>{if(active)setPermission('Unavailable');});};check();const listener=AppState.addEventListener('change',s=>{if(s==='active')check();});return()=>{active=false;listener.remove();};},[]);
  async function run(work:()=>Promise<void>){if(busy)return;setBusy(true);try{await work();setMessage('Saved.');}catch(e){setMessage(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
  return <>
    <Surface style={{gap:12,marginBottom:18}}><Text style={[ink,{fontSize:18,fontWeight:'800'}]}>{tx('language.title')}</Text><Text style={ink}>{tx('language.english')}</Text><Text style={muted}>{tx('language.pending')}</Text><Text style={muted}>{tx('language.voice')}</Text></Surface>
    <Surface style={{gap:12,marginBottom:18}}>
      <Text style={[ink,{fontSize:18,fontWeight:'800'}]}>Voice and units</Text>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={ink}>Spoken guidance</Text><Switch accessibilityLabel="Spoken guidance" value={data.preferences.voiceEnabled} disabled={busy} onValueChange={value=>{void run(()=>updateDriverData(d=>({...d,preferences:{...d.preferences,voiceEnabled:value}})));}}/></View>
      {(['en-GH','en-GB','en-US'] as const).map(language=><ActionButton key={language} title={`${data.preferences.voiceLanguage===language?'Selected: ':''}English (${language.split('-')[1]})`} secondary disabled={busy} onPress={()=>{void run(()=>updateDriverData(d=>({...d,preferences:{...d.preferences,voiceLanguage:language}})));}}/>)}
      <Text style={muted}>Device voice availability varies. Instructions remain in English.</Text>
      {(['metric','imperial'] as const).map(units=><ActionButton key={units} title={`${data.preferences.units===units?'Selected: ':''}${units==='metric'?'Metric (km, metres)':'Imperial (miles, feet)'}`} secondary disabled={busy} onPress={()=>{void run(()=>updateDriverData(d=>({...d,preferences:{...d.preferences,units}})));}}/>)}
      <Text style={muted}>Travel distances and GPS speed use your units. Verified Ghana speed limits remain labelled in km/h.</Text>
    </Surface>
    <Surface style={{gap:12,marginBottom:18}}>
      <Text style={[ink,{fontSize:18,fontWeight:'800'}]}>Location and privacy</Text>{!!driverStorageStatus().error&&<Text style={muted}>{driverStorageStatus().error}</Text>}<Text style={muted}>Location permission: {permission}</Text>
      <Text style={muted}>ROVA asks for foreground location when locating you, navigating or reporting. With permission, foreground movement checks also defer forms while moving. It does not record continuous location history. A route is saved only when you explicitly choose offline saving. Search and routing send necessary queries/coordinates to the configured providers. Saved places are stored only when you choose to save them. Saved places and optional search history are encrypted on this phone.</Text>
      <ActionButton title="Open phone permission settings" secondary onPress={()=>{void Linking.openSettings().catch(()=>setMessage('Open ROVA permissions in your phone settings.'));}}/>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={ink}>Remember recent searches on this phone</Text><Switch accessibilityLabel="Remember recent searches" value={history.enabled} disabled={busy} onValueChange={enabled=>{void run(async()=>{const next={enabled,queries:enabled?history.queries:[]};await writeHistory(next);});}}/></View>
      <ActionButton title="Clear search history" secondary disabled={busy} onPress={()=>{void run(async()=>{const next={enabled:readHistory().enabled,queries:[]};await writeHistory(next);placesProvider.clearCache();});}}/>
      <ActionButton title="Erase saved places, preferences and searches on this phone" secondary disabled={busy} onPress={()=>Alert.alert('Erase phone saved data?','This clears saved places, preferences, searches and the current route preview. Account copies are erased separately.',[{text:'Cancel',style:'cancel'},{text:'Erase',style:'destructive',onPress:()=>{void run(async()=>{await erasePhoneData(()=>{setRoute(null);setPickedDestination(null);setSelectedRoutingOption(null);});});}}])}/>
      <ActionButton title="Erase my anonymous reporting data" secondary disabled={busy} onPress={()=>Alert.alert('Erase anonymous reporting data?','Your report notes, votes and device identity will be removed. Public safety reports can remain anonymous.',[{text:'Cancel',style:'cancel'},{text:'Erase',style:'destructive',onPress:()=>{void run(eraseReportingData);}}])}/>
      {!!message&&<Text accessibilityLiveRegion="polite" style={muted}>{message}</Text>}
    </Surface>
  </>;
}
