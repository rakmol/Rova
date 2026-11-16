import {NetworkNotice} from '../offline/NetworkNotice';
import {offlineData} from '../offline/data';
import {offlinePackState} from '@rova/shared';
import {router} from 'expo-router';
import {useEffect,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ActionButton,Pill,Surface} from '../components/ui';
import {useRoutePreview} from '../map/RouteProvider';
import {MapboxMap} from '../map/MapboxMap';
import {mapboxProvider} from '../map/mapboxProvider';
import {useActiveNavigation as useNavigationSession} from '../navigation/ActiveNavigationProvider';
import {JourneyMetrics} from '../navigation/JourneyMetrics';
import {NavigationInstruction} from '../navigation/NavigationInstruction';
import {SmartAlertPanel} from '../navigation/SmartAlertPanel';
import {useRovaTheme} from '../theme/ThemeProvider';
import {HazardFeedView} from '../incidents/NearbyHazards';
import {travelDistance,useDriverData} from '../account/local';
import {useDrivingSafety} from '../safety/driving';
import {tx} from '../i18n';
export default function NavigationScreen(){
 const{theme}=useRovaTheme(),{preferences}=useDriverData(),motion=useDrivingSafety();
 const{route,selectedRoutingOption,vehicleType}=useRoutePreview();
 const session=useNavigationSession(route?.originIsLive?route.destination:undefined,selectedRoutingOption,vehicleType),s=session.snapshot;
 const[topInset,setTopInset]=useState(150),[bottomInset,setBottomInset]=useState(230);
 const[details,setDetails]=useState(false);
 const[mapReady,setMapReady]=useState(false),[mapError,setMapError]=useState<string|null>(null);
 const{fontScale,height,width}=useWindowDimensions();
 useEffect(()=>{let active=true;void mapboxProvider.initialize().then(()=>{if(active)setMapReady(true);}).catch(()=>{if(active)setMapError('Map unavailable. Text guidance remains available.');});return()=>{active=false;};},[]);
 const end=()=>{session.stop();router.back();},ink={color:theme.colors.ink},muted={color:theme.colors.inkMuted};
 if(!route||!route.originIsLive)return <SafeAreaView style={[styles.empty,{backgroundColor:theme.colors.background}]}><Text style={[styles.instruction,ink]}>{tx('nav.chooseRoute')}</Text><ActionButton title={tx('nav.back')} onPress={end}/></SafeAreaView>;
 const displayRoute=s.route??selectedRoutingOption??route;
 const seconds=s.state==='arrived'?0:s.progress?.remainingSeconds??displayRoute.durationSeconds,remaining=s.state==='arrived'?0:s.progress?.remainingMeters??displayRoute.distanceMeters;
 const eta=new Date(session.updatedAt+seconds*1000).toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit'}),active=s.state==='navigating'&&s.gpsReliable;
 const large=fontScale>=1.6||height<550||width>height;
 const compact=motion.locked&&!motion.passenger;
 const mapHeight=Math.max(180,Math.min(320,height*(large?0.3:0.36)));
 const controls=<View style={[styles.row,{flexWrap:'wrap'}]}><View style={styles.control}><ActionButton title={session.muted?tx('nav.unmute'):tx('nav.mute')} secondary onPress={session.toggleMuted}/></View>{s.state==='error'&&<View style={styles.control}><ActionButton title={tx('nav.retry')} onPress={session.retry}/></View>}<View style={styles.control}><ActionButton title={s.state==='arrived'?tx('nav.done'):tx('nav.end')} onPress={end}/></View></View>;
 const instructionInk=large?theme.colors.ink:theme.mode==='dark'?'#0D1D26':'#FFFFFF',instructionMuted=large?theme.colors.inkMuted:theme.mode==='dark'?'#204847':'#D9F4EF';
 const instructionPanel=<Surface style={[styles.card,!large&&{padding:12,gap:4,backgroundColor:theme.colors.brandStrong,borderColor:theme.colors.brandStrong}]}>
    <View style={[styles.row,{flexWrap:'wrap'}]}><Text numberOfLines={large?undefined:1} accessibilityLabel={route.destinationLabel} style={[styles.title,{color:instructionInk},!large&&{fontSize:14,lineHeight:20,minWidth:80}]}>{route.destinationLabel}</Text>{large&&<Pill tone={active?'brand':'warning'}>{(s.state==='navigating'&&!s.gpsReliable)||s.state==='paused'?tx('nav.state.paused'):tx(('nav.state.'+s.state) as import('../i18n').MessageKey)}</Pill>}</View>
    {['idle','previewing','error','off-route','rerouting'].includes(s.state)&&<Text accessibilityLiveRegion="polite" style={[styles.note,muted]}>{s.message}</Text>}
    <NavigationInstruction snapshot={s} ink={instructionInk} muted={instructionMuted} compact={!large}/>
   </Surface>;
 const mapPanel=<View style={large?[styles.map,{height:mapHeight}]:StyleSheet.absoluteFill} testID="navigation-map-area">
    {mapReady?<MapboxMap fill navigationMode approvedPins={session.approvedContributions?.pins} center={session.mapFix?.coordinate??s.progress?.coordinate??route.origin} navigationFix={session.mapFix??undefined} navigationBearing={session.mapBearing} routeGeometry={displayRoute.geometry} routeProgressMeters={s.progress?.along??0} mapBottomInset={large?0:bottomInset} controlsTopInset={large?12:topInset+8} destination={route.destination} locationEnabled={(session.mapFix?session.updatedAt-session.mapFix.timestamp<=10000:s.gpsReliable)&&!['paused','arrived','idle','error'].includes(s.state)} onMapLoaded={()=>setMapError(null)} onMapError={setMapError}/>:<Text style={muted}>{mapError??'Preparing navigation map...'}</Text>}
   </View>;
 const journeyPanel=<Surface style={[styles.card,!large&&{padding:12,gap:6}]}>
    <View style={{flexDirection:'row',alignItems:'center',gap:4}}><View style={{flex:1}}><JourneyMetrics compact={!large} metrics={[{label:tx('nav.arrivalLabel'),shortLabel:'ETA',value:eta},{label:tx('nav.remainingLabel'),shortLabel:'LEFT',value:tx('nav.minutes',{minutes:Math.ceil(seconds/60)})},{label:tx('nav.distanceLabel'),shortLabel:'DISTANCE',value:travelDistance(remaining,preferences.units)},{label:preferences.units==='imperial'?tx('nav.speedMphLabel'):tx('nav.speedLabel'),shortLabel:preferences.units==='imperial'?'MPH':'KM/H',value:s.speedKmh===null||!s.gpsReliable?'--':String(Math.round(s.speedKmh/(preferences.units==='imperial'?1.609344:1)))}]} /></View>{!large&&<Pressable accessibilityRole="button" accessibilityLabel={details?'Hide journey details':'Show journey details'} accessibilityState={{expanded:details}} onPress={()=>setDetails(v=>!v)} style={{minWidth:44,minHeight:48,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:24,color:theme.colors.ink}}>{details?'⌃':'⌄'}</Text></Pressable>}</View>
    <SmartAlertPanel snapshot={session.smartAlerts} vehicleType={vehicleType} audioEnabled={session.alertAudio} onToggleAudio={session.toggleAlertAudio} reportedRoadAlert={session.reportedRoadAlert} reportedSpeed={session.reportedSpeed} compact showAudioControl={large||details}/>
    {session.contributionAlert&&<Text accessibilityLiveRegion="polite" style={[styles.note,{color:theme.colors.warning}]}>{session.contributionAlert.text}</Text>}
    {!session.contributionAlert&&session.congestionAlert&&<Text accessibilityLiveRegion="polite" style={[styles.note,{color:theme.colors.warning}]}>! Community congestion report near route | approximately {session.congestionAlert.distanceMeters} m ahead</Text>}
    {(large||details)&&<ScrollView style={!large?{maxHeight:100}:undefined} contentContainerStyle={{gap:8}} nestedScrollEnabled>
    {!large&&s.progress?.instruction&&<Text style={[styles.note,muted]}>{s.progress.instruction}</Text>}
    <NetworkNotice/>
    <HazardFeedView state={session.communityHazards} compact driving={compact} coordinate={s.gpsReliable&&s.state==='navigating'?s.progress?.coordinate:undefined}/>
    {!s.gpsReliable&&s.route&&<Text style={[styles.note,muted]}>{tx('nav.lastPosition')}</Text>}
    {offlineData().route?.option.id===selectedRoutingOption?.id&&offlineData().route&&session.updatedAt>=offlineData().route!.expiresAt&&<Text style={[styles.note,muted]}>Saved route data may be outdated. Reconnect to refresh the route.</Text>}
    {offlinePackState(offlineData().safety,session.updatedAt)==='stale'&&<Text style={[styles.note,muted]}>Data may be outdated. Offline speed warnings are unavailable until refreshed.</Text>}
    {session.voiceError&&<Text accessibilityRole="alert" style={[styles.note,muted]}>{session.voiceError}</Text>}
    {mapError&&<Text accessibilityRole="alert" style={[styles.note,muted]}>{mapError}</Text>}
    {!compact&&<Text style={[styles.credit,muted]}>{tx('nav.experimental')}</Text>}
    </ScrollView>}
   </Surface>;
 return <SafeAreaView style={[styles.screen,{backgroundColor:theme.colors.background}]}>
  {large?<ScrollView scrollEnabled testID="navigation-accessible-content" style={{flex:1}} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{instructionPanel}{mapPanel}{journeyPanel}</ScrollView>:<View style={{flex:1}}>
    {mapPanel}
    <View onLayout={e=>setTopInset(e.nativeEvent.layout.height)}>{instructionPanel}</View>
    <View style={{flex:1,minHeight:80}} pointerEvents="box-none"/>
    <ScrollView testID="navigation-accessible-content" onLayout={e=>setBottomInset(e.nativeEvent.layout.height)} style={{maxHeight:height*.34,flexGrow:0}} contentContainerStyle={{paddingBottom:4}} keyboardShouldPersistTaps="handled">{journeyPanel}</ScrollView>
  </View>}
  <View testID="persistent-navigation-controls" style={[styles.fixedControls,{backgroundColor:theme.colors.surface,borderColor:theme.colors.divider}]}>{controls}<Text style={[styles.credit,muted,{textAlign:'center',marginTop:4}]}>Powered by Geoapify | OpenStreetMap contributors</Text></View>
 </SafeAreaView>;
}

const styles=StyleSheet.create({fixedControls:{paddingHorizontal:16,paddingVertical:10,borderTopWidth:1},screen:{flex:1},content:{flexGrow:1},empty:{flex:1,padding:24,justifyContent:'center',gap:16},card:{marginHorizontal:12,marginVertical:8,padding:16,gap:12},row:{flexDirection:'row',gap:8,alignItems:'center'},title:{flex:1,minWidth:160,fontSize:18,lineHeight:26,fontWeight:'800'},instruction:{fontSize:28,lineHeight:36,fontWeight:'800'},map:{minHeight:180,overflow:'hidden',justifyContent:'center',marginVertical:4},metric:{flex:1,minWidth:0},control:{flex:1,minWidth:110},value:{fontSize:22,fontWeight:'800'},label:{fontSize:13,marginTop:3},note:{fontSize:16,lineHeight:24},credit:{fontSize:12,lineHeight:18}});
