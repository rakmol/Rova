import {useEffect,type ReactNode} from 'react';
import {Keyboard,Pressable,Text,View} from 'react-native';
import {useDrivingSafety,acknowledgePassenger,resetPassenger} from './driving';
import {useRovaTheme} from '../theme/ThemeProvider';
import {tx} from '../i18n';
export function DrivingGate({children}:{children:ReactNode}){
 const state=useDrivingSafety(),{theme}=useRovaTheme();const blocked=state.locked&&!state.passenger;
 useEffect(()=>{if(blocked)Keyboard.dismiss();},[blocked]);
 if(!blocked)return <>{state.passenger&&<Pressable accessibilityRole="button" accessibilityLabel={tx('drive.passengerOff')} onPress={resetPassenger} style={{minHeight:48,padding:12,backgroundColor:theme.colors.warningTint}}><Text style={{color:theme.colors.warning}}>{tx('drive.passengerActive')}. {tx('drive.passengerOff')}</Text></Pressable>}{children}</>;
 return <View style={{padding:24,gap:20}} accessibilityLiveRegion="polite">
  <Text accessibilityRole="header" style={{fontSize:26,lineHeight:34,fontWeight:'800',color:theme.colors.ink}}>{tx('drive.title')}</Text>
  <Text style={{fontSize:18,lineHeight:28,color:theme.colors.inkMuted}}>{tx('drive.detail')}</Text>
  <Pressable accessibilityRole="button" accessibilityLabel={tx('drive.passenger')} accessibilityHint={tx('drive.passengerHint')} onPress={acknowledgePassenger} style={{minHeight:56,padding:16,borderWidth:2,borderRadius:12,borderColor:theme.colors.brandStrong}}><Text style={{fontSize:18,fontWeight:'700',color:theme.colors.ink}}>{tx('drive.passenger')}</Text></Pressable>
 </View>;
}
