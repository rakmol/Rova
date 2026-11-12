import {Text,View} from 'react-native';
import {ActionButton} from '../components/ui';
import {useRovaTheme} from '../theme/ThemeProvider';
import {smartAlertFlags,type SmartAlertSnapshot} from './smart-alerts';
import type {VehicleClass} from '@rova/shared';
import type {ReportedRoadAlertSnapshot} from './reported-road-alerts';
import {tx} from '../i18n';
export const vehicleLabels:Record<VehicleClass,string>={private_car:tx('vehicle.private_car'),taxi:tx('vehicle.taxi'),motorcycle:tx('vehicle.motorcycle'),commercial_vehicle:tx('vehicle.commercial_vehicle'),bus:tx('vehicle.bus'),heavy_vehicle:tx('vehicle.heavy_vehicle')};
const types={fixed_speed:tx('enforcement.fixed_speed'),average_speed:tx('enforcement.average_speed'),red_light:tx('enforcement.red_light'),combined:tx('enforcement.combined'),checkpoint:tx('enforcement.checkpoint'),unknown:tx('enforcement.unknown')};
export function SmartAlertPanel({snapshot:s,vehicleType,audioEnabled,onToggleAudio,reportedRoadAlert,compact=false}:{snapshot:SmartAlertSnapshot;vehicleType:VehicleClass;audioEnabled:boolean;onToggleAudio():void;reportedRoadAlert?:ReportedRoadAlertSnapshot;compact?:boolean}){
 const{theme}=useRovaTheme(),note={color:theme.colors.inkMuted,fontSize:14,lineHeight:20};
 return <View style={{gap:8}}>
  {!compact&&<Text style={note}>{tx('alert.title')} | {vehicleLabels[vehicleType]}</Text>}
  <View style={{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'}}>
   <Text accessibilityLabel={s.limitKmh===null?tx('alert.limitUnknown'):tx('alert.limit',{speed:s.limitKmh})} style={{flexGrow:1,flexShrink:1,color:theme.colors.ink,fontSize:s.limitKmh===null?16:24,lineHeight:s.limitKmh===null?24:30,fontWeight:'800'}}>{s.limitKmh===null?tx('alert.limitUnknown'):tx('alert.limit',{speed:s.limitKmh})}</Text>
   {smartAlertFlags.enabled&&<ActionButton title={audioEnabled?tx('alert.audioOn'):tx('alert.audioOff')} secondary onPress={onToggleAudio}/>}
  </View>
  {s.state==='overspeed'&&<View style={{padding:12,borderWidth:2,borderColor:theme.colors.warning,backgroundColor:theme.colors.warningTint,borderRadius:12}}>
   <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{color:theme.colors.warning,fontSize:24,lineHeight:32,fontWeight:'800'}}>! {tx('alert.overspeed')}. {tx('alert.slowDown')}</Text>
  </View>}
  {s.upcoming&&<Text style={{color:theme.colors.ink,fontSize:18,lineHeight:26}}>{s.upcoming.kind==='transition'?tx('alert.limitAhead',{speed:s.upcoming.speedLimitKmh!}):types[s.upcoming.enforcementType]} | {tx('alert.about',{distance:Math.round(s.upcoming.distanceMeters/10)*10})}</Text>}
  {reportedRoadAlert?.nearby&&<Text accessibilityLiveRegion="polite" style={[note,{color:theme.colors.warning,fontWeight:'700'}]}>! {tx('alert.reported',{road:reportedRoadAlert.nearby.roadName})} | {tx('alert.unverified')}. {tx('alert.positionUnknown')}</Text>}
  {!compact&&<Text style={note}>{!smartAlertFlags.enabled?tx('alert.disabled'):s.enforcementStatus==='verified_corridor'?tx('alert.corridor'):tx('alert.coverageUnknown')}. {tx('alert.signs')}</Text>}
 </View>;
}
