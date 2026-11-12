import {Text} from 'react-native';
import {useNetwork} from './network';
import {useRovaTheme} from '../theme/ThemeProvider';
export function NetworkNotice(){const n=useNetwork();const{theme}=useRovaTheme();
 const text=n.status==='offline'?'Offline: saved route guidance can continue with GPS. New routes, rerouting and fresh reports need internet.':n.status==='degraded'?'Some online services are unavailable. Saved data may be outdated; retry when connected.':n.status==='unknown'?'Checking connection. Network availability is not confirmed.':n.lowData?'Low-data mode: fewer safety lookups and no automatic hazard stream.':'Online';
 if(n.status==='online'&&!n.lowData)return null;
 return <Text accessibilityLiveRegion="polite" style={{color:theme.colors.inkMuted,fontSize:11,lineHeight:16,marginVertical:4}}>{text}</Text>;
}
