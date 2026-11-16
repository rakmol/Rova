import {useEffect,useState} from 'react';
import {Alert,AppState,Linking,Text} from 'react-native';
import {ActionButton,Surface} from '../components/ui';
import {useRovaTheme} from '../theme/ThemeProvider';
import {backgroundPermission,enableBackgroundNavigation} from './background-location';
export function BackgroundNavigationSettings(){
 const {theme}=useRovaTheme(),[allowed,setAllowed]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;const check=()=>{void backgroundPermission().then(p=>{if(active)setAllowed(p);}).catch(()=>{});};check();const sub=AppState.addEventListener('change',s=>{if(s==='active')check();});return()=>{active=false;sub.remove();};},[]);
 const enable=()=>Alert.alert('Keep navigation running?',
  'ROVA uses your location during an active journey even when you use another app or lock your phone. Android shows an ongoing navigation notification. Ending navigation stops the service. ROVA does not save a continuous travel history. Choose “Allow all the time” on the next settings screen.',
  [{text:'Not now',style:'cancel'},{text:'Continue',onPress:()=>{void enableBackgroundNavigation().then(()=>setAllowed(true)).catch(e=>setError(e.message));}}]);
 return <Surface style={{gap:10,marginBottom:18}}><Text style={{color:theme.colors.ink,fontSize:18,fontWeight:'800'}}>Navigation outside ROVA</Text><Text style={{color:theme.colors.inkMuted}}>{allowed?'Background location is allowed. Active guidance can continue with an ongoing Android notification.':'Allow background location to keep active guidance running when using another app. Without it, your journey stays open and resumes when you return.'}</Text><ActionButton secondary title={allowed?'Manage background location permission':'Enable background navigation'} onPress={allowed?()=>{void Linking.openSettings();}:enable}/>{!!error&&<Text accessibilityRole="alert" style={{color:theme.colors.warning}}>{error}</Text>}</Surface>;
}
