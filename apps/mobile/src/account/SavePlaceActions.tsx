import { useState } from 'react';
import { Text, View } from 'react-native';
import { ActionButton } from '../components/ui';
import type { Place } from '../places/provider';
import { saveLocalPlace } from './local';
export function SavePlaceActions({place}:{place:Place}){
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const allowed=!!place.storageProof;
  if(!allowed)return <Text>Saving this provider result is unavailable without permanent-storage permission.</Text>;
  return <View style={{gap:8}}>{(['home','work','favorite'] as const).map(kind=><ActionButton key={kind} secondary title={`Save as ${kind==='home'?'Home':kind==='work'?'Work':'favorite'}`} disabled={busy} onPress={()=>{if(busy)return;setBusy(true);void saveLocalPlace({clientKey:`${kind}-${place.id}`.slice(0,100),kind,label:place.name.slice(0,80),address:place.detail.slice(0,300),lon:place.coordinate[0],lat:place.coordinate[1],storageProof:place.storageProof,attribution:place.attribution.slice(0,500)}).then(()=>setMessage('Saved on this phone.')).catch(e=>setMessage(e instanceof Error?e.message:'Could not save.')).finally(()=>setBusy(false));}}/>)}{!!message&&<Text accessibilityLiveRegion="polite">{message}</Text>}</View>;
}
