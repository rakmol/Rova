import {NetworkNotice} from '../offline/NetworkNotice';
import {offlineData} from '../offline/data';
import {offlinePackState} from '@rova/shared';
import {router} from 'expo-router';
import {useEffect,useState} from 'react';
import {ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {ActionButton,Pill,Surface} from '../components/ui';
import {useRoutePreview} from '../map/RouteProvider';
import {MapboxMap} from '../map/MapboxMap';
import {mapboxProvider} from '../map/mapboxProvider';
import {useNavigationSession} from '../navigation/useNavigationSession';
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
 const[mapReady,setMapReady]=useState(false),[mapError,setMapError]=useState<string|null>(null);
 const{fontScale}=useWindowDimensions();
 useEffect(()=>{let active=true;void mapboxProvider.initialize().then(()=>{if(active)setMapReady(true);}).catch(()=>{if(active)setMapError('Map unavailable. Text guidance remains available.');});return()=>{active=false;};},[]);
 const end=()=>{session.stop();router.back();},ink={color:theme.colors.ink},muted={color:theme.colors.inkMuted};
 if(!route||!route.originIsLive)return <SafeAreaView style={[styles.empty,{backgroundColor:theme.colors.background}]}><Text style={[styles.instruction,ink]}>{tx('nav.chooseRoute')}</Text><ActionButton title={tx('nav.back')} onPress={end}/></SafeAreaView>;
 const displayRoute=s.route??selectedRoutingOption??route;
 const seconds=s.state==='arrived'?0:s.progress?.remainingSeconds??displayRoute.durationSeconds,remaining=s.state==='arrived'?0:s.progress?.remainingMeters??displayRoute.distanceMeters;
 const eta=new Date(session.updatedAt+seconds*1000).toLocaleTimeString('en-GH',{hour:'2-digit',minute:'2-digit'}),active=s.state==='navigating'&&s.gpsReliable;
 const large=fontScale>=1.3||(s.progress?.instruction?.length??0)>120;
 const compact=motion.locked&&!motion.passenger;
 const controls=<View style={styles.row}><View style={styles.metric}><ActionButton title={session.muted?tx('nav.unmute'):tx('nav.mute')} secondary onPress={session.toggleMuted}/></View>{s.state==='error'&&<View style={styles.metric}><ActionButton title={tx('nav.retry')} onPress={session.retry}/></View>}<View style={styles.metric}><ActionButton title={s.state==='arrived'?tx('nav.done'):tx('nav.end')} onPress={end}/></View></View>;
 return <SafeAreaView style={[styles.screen,{backgroundColor:theme.colors.background}]}>
  <ScrollView testID="navigation-accessible-content" scrollEnabled={large} contentContainerStyle={[styles.content,!large&&{flex:1}]} keyboardShouldPersistTaps="handled">
   <Surface style={styles.card}>
    <NetworkNotice/>
    <View style={styles.row}><Text numberOfLines={1} accessibilityLabel={route.destinationLabel} style={[styles.title,ink]}>{route.destinationLabel}</Text><Pill tone={active?'brand':'warning'}>{(s.state==='navigating'&&!s.gpsReliable)||s.state==='paused'?tx('nav.state.paused'):tx(('nav.state.'+s.state) as import('../i18n').MessageKey)}</Pill></View>
    {['idle','previewing','error','off-route','rerouting'].includes(s.state)&&<Text accessibilityLiveRegion="polite" style={[styles.note,muted]}>{s.message}</Text>}
    {large&&controls}
    <NavigationInstruction snapshot={s} ink={theme.colors.ink} muted={theme.colors.inkMuted}/>
   </Surface>
   <View style={[styles.map,large&&{flex:0,height:220}]} testID="navigation-map-area">
    {mapReady?<MapboxMap fill center={s.progress?.coordinate??route.origin} routeGeometry={displayRoute.geometry} destination={route.destination} locationEnabled={s.gpsReliable&&!['paused','arrived','idle','error'].includes(s.state)} onMapLoaded={()=>setMapError(null)} onMapError={setMapError}/>:<Text style={muted}>{mapError??'Preparing navigation map...'}</Text>}
   </View>
   <Surface style={styles.card}>
    <View style={[styles.row,{flexWrap:'wrap'}]}>
     {[{label:tx('nav.arrivalLabel'),value:eta},{label:tx('nav.remainingLabel'),value:tx('nav.minutes',{minutes:Math.ceil(seconds/60)})},{label:tx('nav.distanceLabel'),value:travelDistance(remaining,preferences.units)},{label:preferences.units==='imperial'?tx('nav.speedMphLabel'):tx('nav.speedLabel'),value:s.speedKmh===null||!s.gpsReliable?'--':String(Math.round(s.speedKmh/(preferences.units==='imperial'?1.609344:1)))}].map(m=><View key={m.label} accessible accessibilityLabel={m.label+': '+m.value} style={large?{width:'47%'}:styles.metric}><Text style={[styles.value,ink]}>{m.value}</Text><Text style={[styles.label,muted]}>{m.label}</Text></View>)}
    </View>
    <SmartAlertPanel snapshot={session.smartAlerts} vehicleType={vehicleType} audioEnabled={session.alertAudio} onToggleAudio={session.toggleAlertAudio} reportedRoadAlert={session.reportedRoadAlert} compact={compact}/>
    {session.congestionAlert&&<Text accessibilityLiveRegion="polite" style={[styles.note,{color:theme.colors.warning}]}>! Community congestion report near route | approximately {session.congestionAlert.distanceMeters} m ahead</Text>}
    <HazardFeedView state={session.communityHazards} compact driving={compact} coordinate={s.gpsReliable&&s.state==='navigating'?s.progress?.coordinate:undefined}/>
    {!s.gpsReliable&&s.route&&<Text style={[styles.note,muted]}>{tx('nav.lastPosition')}</Text>}
    {offlineData().route?.option.id===selectedRoutingOption?.id&&offlineData().route&&session.updatedAt>=offlineData().route!.expiresAt&&<Text style={[styles.note,muted]}>Saved route data may be outdated. Reconnect to refresh the route.</Text>}
    {offlinePackState(offlineData().safety,session.updatedAt)==='stale'&&<Text style={[styles.note,muted]}>Data may be outdated. Offline speed warnings are unavailable until refreshed.</Text>}
    {session.voiceError&&<Text accessibilityRole="alert" style={[styles.note,muted]}>{session.voiceError}</Text>}
    {mapError&&<Text accessibilityRole="alert" style={[styles.note,muted]}>{mapError}</Text>}
    {!large&&controls}
    <Text style={[styles.credit,muted]}>Powered by Geoapify | OpenStreetMap contributors</Text>
    {!compact&&<Text style={[styles.credit,muted]}>{tx('nav.experimental')}</Text>}
   </Surface>
  </ScrollView>
 </SafeAreaView>;
}
const styles=StyleSheet.create({screen:{flex:1},content:{flexGrow:1},empty:{flex:1,padding:24,justifyContent:'center',gap:16},card:{marginHorizontal:10,marginVertical:6,padding:12,gap:8},row:{flexDirection:'row',gap:8,alignItems:'center'},title:{flex:1,fontSize:18,fontWeight:'800'},instruction:{fontSize:28,lineHeight:36,fontWeight:'800'},map:{flex:1,minHeight:70,overflow:'hidden',justifyContent:'center'},metric:{flex:1,minWidth:0},value:{fontSize:22,fontWeight:'800'},label:{fontSize:13,marginTop:3},note:{fontSize:16,lineHeight:24},credit:{fontSize:12,lineHeight:18}});
