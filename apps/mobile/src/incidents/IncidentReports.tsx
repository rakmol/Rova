import {tx} from "../i18n";
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import type { CommunityIncident, IncidentCategory } from '@rova/shared';
import { ActionButton, Pill, Surface } from '../components/ui';
import { RovaIcon } from '../components/RovaIcon';
import { useRovaTheme } from '../theme/ThemeProvider';
import { canInteract, nearbyIncidents, submitIncident, voteIncident, type IncidentFix, type SafeInteraction } from './client';
import { NearbyHazards } from './NearbyHazards';
const categories:{key:IncidentCategory;label:string}[]=[{key:'pothole',label:tx('category.pothole')},{key:'flood',label:tx('category.flood')},{key:'collision',label:tx('category.collision')},{key:'closure',label:tx('category.closure')},{key:'congestion',label:tx('category.congestion')},{key:'obstacle',label:tx('category.obstacle')}];
async function currentFix():Promise<IncidentFix> {
  const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=='granted')throw new Error('Allow location access to report or see nearby hazards.');
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const p=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Location is taking too long. Try again outdoors.')),12000);})]);
    return {lon:p.coords.longitude,lat:p.coords.latitude,accuracy:p.coords.accuracy??Infinity,timestamp:p.timestamp,speed:p.coords.speed};
  }finally{if(timer)clearTimeout(timer);}
}
export function IncidentReports(){
  const {theme}=useRovaTheme();const ink={color:theme.colors.ink};const muted={color:theme.colors.inkMuted};
  const [mode,setMode]=useState<SafeInteraction|null>(null);const modeRef=useRef<SafeInteraction|null>(null);
  const [busy,setBusy]=useState(false);const working=useRef(false);const mounted=useRef(true);
  const [message,setMessage]=useState('');const [reports,setReports]=useState<CommunityIncident[]>([]);const [loaded,setLoaded]=useState(false);
  const [note,setNote]=useState('');const [showNote,setShowNote]=useState(false);
  const [now,setNow]=useState(()=>Date.now());
  const [checkedArea,setCheckedArea]=useState<[number,number]>();
  const [manualCheck,setManualCheck]=useState<number|null>(null);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',s=>{if(s!=='active'){modeRef.current=null;setMode(null);setNote('');}});return()=>{mounted.current=false;modeRef.current=null;sub.remove();};},[]);
  const chooseMode=(next:SafeInteraction)=>{modeRef.current=next;setMode(next);};
  async function run(action:(f:IncidentFix,m:SafeInteraction)=>Promise<string>){
    if(working.current||!modeRef.current)return;working.current=true;setBusy(true);setMessage('Getting a fresh location...');
    try{
      const f=await currentFix();const m=modeRef.current;if(!mounted.current)return;
      if(!m||!canInteract(m,f))throw new Error('Park safely first, or ask a passenger. ROVA needs a fresh location and a stationary speed reading for parked reporting.');
      setCheckedArea([f.lon,f.lat]);
      const result=await action(f,m);if(!mounted.current)return;setMessage(result);
      try{const rows=await nearbyIncidents(f);if(mounted.current){setReports(rows);setLoaded(true);setManualCheck(f.timestamp);}}catch{if(mounted.current)setMessage(`${result} Nearby reports could not refresh. Try again.`);}
    }catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'Could not connect. Try again.');}
    finally{working.current=false;if(mounted.current)setBusy(false);}
  }
  return <Surface style={styles.panel}>
    <Pill tone="warning">COMMUNITY ROAD HAZARDS</Pill>
    <View style={styles.heading}>
      <View style={[styles.headingIcon,{backgroundColor:theme.colors.brandTint}]}>
        <RovaIcon name="reports" color={theme.colors.brandStrong} size={22}/>
      </View>
      <Text accessibilityRole="header" style={[styles.title,ink]}>Report a road problem</Text>
    </View>
    <Text style={muted}>Use only when safely parked or as a passenger. Voice reporting is coming later.</Text>
    <View style={styles.row}><View style={styles.grow}><ActionButton title={mode==='parked'?'Parked selected':"I'm safely parked"} secondary onPress={()=>chooseMode('parked')} disabled={busy}/></View><View style={styles.grow}><ActionButton title={mode==='passenger'?'Passenger selected':"I'm a passenger"} secondary onPress={()=>chooseMode('passenger')} disabled={busy}/></View></View>
    <Text style={muted}>Your location is rounded before sending (about 150 m uncertainty). No journey trace is submitted. Do not include names, phone numbers or number plates.</Text>
    {mode&&<>
      <View style={styles.grid}>{categories.map(c=><View key={c.key} style={styles.category}><ActionButton title={c.label} disabled={busy} onPress={()=>{void run(async(f,m)=>{const result=await submitIncident(c.key,f,m,note);if(mounted.current)setNote('');return result.duplicate?'Already reported nearby. Confirm the existing report if you can see it.':'Report submitted for review. Thank you.';});}}/></View>)}</View>
      <ActionButton title={showNote?'Hide optional note':'Add optional note'} secondary disabled={busy} onPress={()=>{setShowNote(!showNote);setNote('');}}/>
      {showNote&&<TextInput accessibilityLabel="Optional incident note" placeholder="Brief hazard details (optional)" placeholderTextColor={theme.colors.inkSubtle} value={note} onChangeText={setNote} maxLength={280} multiline style={[styles.input,ink,{borderColor:theme.colors.border,backgroundColor:theme.colors.surface}]} editable={!busy}/>}
      <ActionButton title={busy?'Please wait...':'Refresh hazards within 2 km'} secondary disabled={busy} onPress={()=>{void run(async()=> 'Nearby reports updated.');}}/>
    </>}
    {!!message&&<Text accessibilityLiveRegion="polite" style={muted}>{message}</Text>}
    <NearbyHazards coordinate={checkedArea}/>
    <Text style={[styles.title,ink]}>Manually checked community reports</Text>
    {manualCheck!==null&&<Text style={muted}>Last checked {new Date(manualCheck).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})} · {now-manualCheck>30000?'stale; refresh to check again':'recent manual check'}. This list also includes unverified reports.</Text>}
    <Text style={muted}>Community evidence, separate from authority-verified safety alerts. Locations are approximate. Conflicting votes require review.</Text>
    {loaded&&!reports.some(r=>Date.parse(r.expiresAt)>now)&&<Text style={muted}>No active community reports nearby. This does not guarantee the road is clear.</Text>}
    {!loaded&&<Text style={muted}>Select parked or passenger, then refresh to check nearby hazards.</Text>}
    {reports.filter(r=>Date.parse(r.expiresAt)>now).map(r=><View key={r.id} style={[styles.report,{borderColor:theme.colors.border,backgroundColor:theme.colors.surfaceRaised}]}>
      <Pill tone="warning">{r.status==='verified'?'COMMUNITY · REVIEWED':'COMMUNITY · UNVERIFIED'}</Pill>
      <Text style={[styles.title,ink]}>{categories.find(c=>c.key===r.category)?.label}</Text>
      <Text style={muted}>Approx. {r.coordinate[1].toFixed(3)}, {r.coordinate[0].toFixed(3)} · ±{r.approximateRadiusMeters} m</Text>
      <Text style={muted}>{r.confirmations} confirmations · {r.notThere} not there · evidence score {Math.round(r.confidence*100)}% (not a probability)</Text>
      <Text style={muted}>Expires {new Date(r.expiresAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text>
      <View style={styles.row}>{(['confirm','not_there'] as const).map(decision=><View style={styles.grow} key={decision}><ActionButton title={decision==='confirm'?'Still there':'Not there'} secondary disabled={busy||!mode} onPress={()=>{void run(async(f,m)=>{await voteIncident(r.id,decision,f,m);return 'Vote recorded. Community votes do not establish authority verification.';});}}/></View>)}</View>
    </View>)}
    <Text style={muted}>ROVA reports are not an emergency service. Follow road signs and official instructions.</Text>
  </Surface>;
}
const styles=StyleSheet.create({panel:{gap:14,marginBottom:24},heading:{flexDirection:'row',alignItems:'center',gap:12},headingIcon:{width:42,height:42,borderRadius:14,alignItems:'center',justifyContent:'center'},title:{fontSize:18,lineHeight:25,fontWeight:'800',flex:1},row:{flexDirection:'row',flexWrap:'wrap',gap:8},grow:{flex:1,minWidth:132},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},category:{width:'48%'},input:{borderWidth:1,borderRadius:16,padding:14,minHeight:70,fontSize:16},report:{borderWidth:1,borderRadius:18,padding:16,gap:10}});
