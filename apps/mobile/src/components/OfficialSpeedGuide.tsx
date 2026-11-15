import {Linking,Text} from 'react-native';
import {useState} from 'react';
import {ghanaSpeedRules} from '@rova/shared';
import {Surface,ActionButton} from './ui';
import {useRovaTheme} from '../theme/ThemeProvider';
export function OfficialSpeedGuide(){
 const [linkError,setLinkError]=useState(false);
 const{theme}=useRovaTheme(),ink={color:theme.colors.ink,fontSize:16,lineHeight:24};
 return <Surface style={{gap:12,marginBottom:18}}>
  <Text accessibilityRole="header" style={[ink,{fontWeight:'800'}]}>Ghana speed-limit rules</Text>
  <Text style={ink}>General road limits: 30 km/h in specified areas with predominant human activity; 50 km/h in built-up areas; 90 km/h outside built-up areas excluding motorways; 100 km/h on motorways.</Text>
  <Text style={ink}>Vehicle caps: loaded heavy goods 75; buses, coaches, passengers for reward and unloaded heavy goods 80; saloon cars and light vehicles 100; agricultural and slow-moving vehicles 30 km/h. Other vehicles use the applicable general road limit.</Text>
  <Text style={ink}>ROVA uses the lower applicable road and vehicle limit. Specific Road Authority signs take priority over the general road default. Unknown road categories remain unavailable; this reference does not establish camera coverage. Slow down further when conditions require it.</Text>
  <Text style={ink}>L.I. 2519, regulations 211–213. Source checked {ghanaSpeedRules.checkedAt.slice(0,10)}. Recheck due {ghanaSpeedRules.reviewBy.slice(0,10)}.</Text>
  <ActionButton title="Ghana Police speed guidance" secondary onPress={()=>{setLinkError(false);void Linking.openURL(ghanaSpeedRules.roadSource.url).catch(()=>setLinkError(true));}}/>
  {linkError&&<Text accessibilityRole="alert" style={ink}>Could not open the source. Please try again.</Text>}
 </Surface>;
}
