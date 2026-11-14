import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, BackHandler, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {isContributionPoint,reportPosition} from '../../contributions/location';
import { ActionButton, ContentFrame, Page, PageHeader, Pill, Surface } from '../../components/ui';
import { RovaIcon, type RovaIconName } from '../../components/RovaIcon';
import { useRovaTheme } from '../../theme/ThemeProvider';
import { MapboxMap } from '../../map/MapboxMap';
import { accraDevelopmentCenter, mapboxProvider } from '../../map/mapboxProvider';
import type { MapCoordinate } from '../../map/types';
import { myContributions, submitContribution, type Contribution, type ContributionKind } from '../../contributions/client';

import { IncidentReports } from '../../incidents/IncidentReports';

const categories={place:[['landmark','Landmark'],['market','Market'],['business','Business'],['junction','Junction'],['other','Other place']],fixed_camera:[['fixed_speed','Fixed speed camera'],['red_light','Red-light camera'],['unknown','Equipment type unknown']]} as const;
export default function ContributeScreen(){
 const {theme}=useRovaTheme(),ink={color:theme.colors.ink},muted={color:theme.colors.inkMuted};
 const [kind,setKind]=useState<ContributionKind|'road'|null>(null),[mode,setMode]=useState<'parked'|'passenger'|null>(null),[formOpened,setFormOpened]=useState(false);
 const [name,setName]=useState(''),[category,setCategory]=useState('landmark'),[note,setNote]=useState(''),[direction,setDirection]=useState('');
 const [point,setPoint]=useState<MapCoordinate|null>(null),[mapReady,setMapReady]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[rows,setRows]=useState<Contribution[]|null>(null),[submitted,setSubmitted]=useState(false);
 const working=useRef(false),mounted=useRef(true),operation=useRef(0);
 const [locationMessage,setLocationMessage]=useState(''),[locating,setLocating]=useState(false);
 useEffect(()=>{mounted.current=true;void mapboxProvider.initialize().then(()=>{if(mounted.current)setMapReady(true);}).catch(()=>{});const sub=AppState.addEventListener('change',s=>{if(s==='background'&&!working.current)setMode(null);});return()=>{mounted.current=false;sub.remove();};},[]);
 const close=useCallback(()=>{operation.current++;working.current=false;setBusy(false);setKind(null);setSubmitted(false);setFormOpened(false);setLocationMessage('');setLocating(false);setName('');setNote('');setDirection('');setPoint(null);setMessage('');},[]);
 useFocusEffect(useCallback(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(Keyboard.isVisible()){Keyboard.dismiss();return true;}if(kind){close();return true;}return false;});return()=>sub.remove();},[kind,close]));
 async function run(work:(current:()=>boolean)=>Promise<void>){
  if(working.current)return;const id=++operation.current;const current=()=>mounted.current&&id===operation.current;
  working.current=true;setBusy(true);setMessage('');
  try{await work(current);}catch(e){if(current())setMessage(e instanceof Error?e.message:'Could not connect. Please retry.');}
  finally{if(current()){working.current=false;setBusy(false);}}
 }
 async function handlePosition(){
  await run(async current=>{setLocating(true);setLocationMessage('Finding your position...');try{const fix=await reportPosition();if(current()){setPoint([fix.coords.longitude,fix.coords.latitude]);setLocationMessage('Position selected. Check the pin before sending.');}}catch(e){if(current())setLocationMessage(e instanceof Error?e.message:'Could not get your position. Select a point on the map.');}finally{if(current())setLocating(false);}});
 }

 const choose=(next:ContributionKind|'road')=>{close();setKind(next);setFormOpened(!!mode);setCategory(next==='place'?'landmark':'unknown');};
 const refresh=async()=>{const result=await myContributions();if(mounted.current)setRows(result);};
 return <Page><ContentFrame>
  {kind&&<ActionButton title="All contributions" secondary onPress={close}/>}
  <PageHeader eyebrow="Community" title={kind==='place'?'Add a missing place':kind==='fixed_camera'?'Report fixed equipment':kind==='road'?'Road reports':'Contribute'} subtitle={kind?'Help improve the map with a specific, first-hand observation.':'Local knowledge makes better journeys.'}/>
  {!kind?<>
   <Surface style={styles.hero}><View style={[styles.heroIcon,{backgroundColor:theme.colors.brandTint}]}><RovaIcon name="contribute" color={theme.colors.brandStrong} size={30}/></View><Text style={[styles.title,ink]}>You know your roads.</Text><Text style={muted}>Add a missing place, share a road problem, or suggest fixed enforcement equipment for review.</Text></Surface>
   <ContributionAction title="Add a place" detail="Landmarks, markets, businesses and junctions" icon="locate" onPress={()=>choose('place')}/>
   <ContributionAction title="Report a road problem" detail="Potholes, flooding, closures and more" icon="reports" onPress={()=>choose('road')}/>
   <ContributionAction title="Report fixed enforcement equipment" detail="A fixed camera or red-light camera you observed" icon="camera" onPress={()=>choose('fixed_camera')}/>
   <View style={styles.section}><Text style={[styles.title,ink]}>Your contributions</Text><ActionButton title={busy?'Loading…':'Refresh my contributions'} secondary disabled={busy} onPress={()=>void run(refresh)}/></View>
   {rows?.length===0&&<Text style={muted}>No active place or equipment suggestions from this phone. Road hazards are managed in Road reports.</Text>}
   {rows?.map(row=><Surface key={row.id} style={styles.history}><Text style={[styles.rowTitle,ink]}>{row.name}</Text><Pill tone={row.status==='pending'?'warning':'neutral'}>{row.status==='pending'?'PENDING REVIEW':row.status==='approved'?'APPROVED ON MAP':row.status==='reviewed'?'REVIEWED SUGGESTION':'NOT ACCEPTED'}</Pill><Text style={muted}>Community suggestion · not authority verified</Text></Surface>)}
  </>:kind==='road'?<IncidentReports/>:submitted?<Surface style={styles.form}><Pill tone="warning">PENDING REVIEW</Pill><Text accessibilityRole="header" style={[styles.title,ink]}>Thank you for contributing</Text><Text style={muted}>Your suggestion is in the admin review queue. Approved community suggestions appear on the map with a community label.</Text><ActionButton title="Report another" onPress={()=>{setSubmitted(false);setName('');setNote('');setDirection('');setPoint(null);setMessage('');}}/><ActionButton title="View my contributions" secondary onPress={()=>{close();void run(refresh);}}/></Surface>:<Surface style={styles.form}>
   <Pill tone="warning">COMMUNITY SUGGESTION · NOT VERIFIED</Pill>
   <Text style={muted}>Use this form only when safely parked or as a passenger.</Text>
   <View style={styles.wrap}>{(!mode?['parked','passenger']:[]) .map(value=><View key={value} style={{flex:1,minWidth:130}}><ActionButton title={value==='parked'?(mode===value?'Parked selected':"I'm safely parked"):(mode===value?'Passenger selected':"I'm a passenger")} secondary onPress={()=>{setMode(value as 'parked'|'passenger');setFormOpened(true);}} disabled={busy}/></View>)}</View>
   {formOpened&&<><Text style={muted}>{mode==='parked'?'Safely parked':mode==='passenger'?'Reporting as a passenger':'Your draft is kept. Confirm parked or passenger before editing or sending.'}</Text><ActionButton title="Change reporting mode" secondary disabled={busy} onPress={()=>setMode(null)}/>
    <Text style={[styles.rowTitle,ink]}>{kind==='place'?'Place name':'Road or landmark near the equipment'}</Text>
    <TextInput accessibilityLabel="Contribution name" value={name} onChangeText={setName} maxLength={120} placeholder={kind==='place'?'Name used locally':'Road or junction name'} placeholderTextColor={theme.colors.inkSubtle} style={[styles.input,ink,{borderColor:theme.colors.border}]} editable={!busy&&!!mode}/>
    <View accessibilityRole="radiogroup" accessibilityLabel="Contribution category" style={styles.wrap}>{categories[kind].map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:category===value}} onPress={()=>setCategory(value)} disabled={busy||!mode} style={[styles.chip,{backgroundColor:category===value?theme.colors.brandTint:theme.colors.surfaceRaised,borderColor:category===value?theme.colors.brandStrong:theme.colors.divider}]}><Text style={ink}>{label}</Text></Pressable>)}</View>
    <Text style={[styles.rowTitle,ink]}>Choose the place on the map</Text><Text style={muted}>Tap the observed location. We send this one selected point, not your route or travel history.</Text>
    {mapReady?<MapboxMap center={point??accraDevelopmentCenter} destination={point??undefined} locationEnabled={false} onPickCoordinate={coordinate=>{if(busy||!mode)return;if(!isContributionPoint(coordinate)){setLocationMessage('Choose a location in Ghana. Your existing pin has been kept.');return;}setPoint(coordinate);setLocationMessage('Pin selected. Check the observed position before sending.');}} onMapLoaded={()=>{}} onMapError={()=>setMessage('Map unavailable. Try again when connected.')}/>:<Text style={muted}>Map preview unavailable. Reconnect to choose a point.</Text>}
    <ActionButton title={locating?'Finding position...':'Use my current position as the pin'} secondary disabled={busy||!mode} onPress={()=>void handlePosition()}/>
    {!!locationMessage&&<Text accessibilityLiveRegion="polite" style={muted}>{locationMessage}</Text>}
    <Text style={muted}>{point?'Selected pin: '+point[1].toFixed(5)+', '+point[0].toFixed(5):'Select a pin before submitting.'}</Text>
    {kind==='fixed_camera'&&<><Text style={muted}>Report fixed equipment only. Do not submit mobile enforcement positions. Type unknown if you cannot identify the equipment; do not guess its speed limit.</Text><TextInput accessibilityLabel="Observed travel direction" value={direction} onChangeText={setDirection} maxLength={120} placeholder="Travel direction, if known (optional)" placeholderTextColor={theme.colors.inkSubtle} style={[styles.input,ink,{borderColor:theme.colors.border}]} editable={!busy&&!!mode}/></>}
    <TextInput accessibilityLabel="Contribution details" value={note} onChangeText={setNote} maxLength={500} multiline placeholder="What did you observe? No personal or vehicle details." placeholderTextColor={theme.colors.inkSubtle} style={[styles.input,ink,{borderColor:theme.colors.border,minHeight:90}]} editable={!busy&&!!mode}/>
    <Text style={muted}>Suggestions stay pending until reviewed. An administrator must approve a suggestion before it appears as a community pin. This does not confirm a camera or set a legal speed limit. Suggestions expire after 90 days. Erasing reporting data from this phone removes these submissions.</Text>
    <ActionButton title={busy?'Sending…':'Send for review'} disabled={busy||!mode||!point||name.trim().length<2} onPress={()=>{if(!point||!mode)return;const proposal={kind,name:name.trim(),category,lon:point[0],lat:point[1],note:note.trim(),direction:direction.trim(),interaction:mode};void run(async current=>{const result=await submitContribution(proposal);if(!current())return;setSubmitted(true);setMessage(result.duplicate?'You already submitted this suggestion.':'Sent for review. Thank you for helping improve ROVA.');try{await refresh();}catch{if(current())setMessage('Sent for review. Your contributions list could not refresh; do not send again.');}});}}/>
   </>}
  </Surface>}
  {!!message&&<Text accessibilityLiveRegion="polite" style={[muted,{marginVertical:16}]}>{message}</Text>}
 </ContentFrame></Page>;
}
function ContributionAction({title,detail,icon,onPress}:{title:string;detail:string;icon:RovaIconName;onPress:()=>void}){
 const {theme}=useRovaTheme();
 return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={[styles.action,{backgroundColor:theme.colors.surface,borderColor:theme.colors.divider}]}><View style={[styles.icon,{backgroundColor:theme.colors.brandTint}]}><RovaIcon name={icon} color={theme.colors.brandStrong}/></View><View style={{flex:1,gap:5}}><Text style={[styles.rowTitle,{color:theme.colors.ink}]}>{title}</Text><Text style={{color:theme.colors.inkMuted}}>{detail}</Text></View><RovaIcon name="chevron" color={theme.colors.inkMuted}/></Pressable>;
}
const styles=StyleSheet.create({hero:{gap:12,marginBottom:20},heroIcon:{width:60,height:60,borderRadius:30,alignItems:'center',justifyContent:'center'},title:{fontSize:21,fontWeight:'700'},rowTitle:{fontSize:16,fontWeight:'600'},action:{flexDirection:'row',alignItems:'center',gap:12,padding:18,borderWidth:1,borderRadius:20,marginBottom:10,minHeight:94},icon:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},section:{gap:12,marginVertical:20},history:{gap:10,marginBottom:12},form:{gap:16},wrap:{flexDirection:'row',flexWrap:'wrap',gap:8},input:{borderWidth:1,borderRadius:14,padding:14,minHeight:52,fontSize:16},chip:{minHeight:48,paddingHorizontal:14,paddingVertical:12,borderRadius:24,borderWidth:1,justifyContent:'center'}});
