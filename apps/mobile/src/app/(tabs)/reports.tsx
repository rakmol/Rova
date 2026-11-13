import {useState} from 'react';
import {router} from 'expo-router';
import {Pressable,Text,View} from 'react-native';
import {ContentFrame,Page} from '../../components/ui';
import {ScreenTopBar} from '../../components/ScreenTopBar';
import {PublicEnforcementReports} from '../../reports/PublicEnforcementReports';
import {IncidentReports} from '../../incidents/IncidentReports';
import {useRovaTheme} from '../../theme/ThemeProvider';
export default function ReportsScreen(){
 const{theme}=useRovaTheme(),[tab,setTab]=useState<'hazards'|'areas'>('hazards');
 return <Page><ContentFrame><ScreenTopBar title="Road reports" backLabel="Back to Contribute" onBack={()=>router.back()}/><View accessibilityRole="tablist" style={{flexDirection:'row',gap:8,marginBottom:20}}>{([['hazards','Road hazards'],['areas','Reported areas']] as const).map(([key,label])=><Pressable key={key} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',padding:12,borderRadius:24,backgroundColor:tab===key?theme.colors.brandTint:theme.colors.surface}}><Text style={{color:theme.colors.ink,fontWeight:'600'}}>{label}</Text></Pressable>)}</View>{tab==='hazards'?<IncidentReports/>:<PublicEnforcementReports/>}</ContentFrame></Page>;
}
