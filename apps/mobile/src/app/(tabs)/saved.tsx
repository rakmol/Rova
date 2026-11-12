import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ActionButton, ContentFrame, Page, PageHeader, Surface } from '../../components/ui';
import { useRovaTheme } from '../../theme/ThemeProvider';
import { useRoutePreview } from '../../map/RouteProvider';
import { updateDriverData, useDriverData } from '../../account/local';
export default function SavedScreen(){
  const {theme}=useRovaTheme();const {setPickedDestination}=useRoutePreview();const data=useDriverData();const [message,setMessage]=useState('');
  return <Page><ContentFrame>
    <PageHeader eyebrow="Your places" title="Saved" subtitle="Home, Work and favorites. Sign-in is optional."/>
    <Surface style={{gap:12}}>
      <Text style={{color:theme.colors.inkMuted}}>Search for a destination and choose Save as Home, Work or favorite. Places stay on this phone unless you explicitly back them up to an account in Settings.</Text>
      <ActionButton title="Find a place to save" onPress={()=>router.push('/destination-search')}/>
      {!data.places.length&&<Text style={{color:theme.colors.ink}}>Nothing saved yet</Text>}
      {data.places.map(place=><View key={place.clientKey} style={{gap:8,paddingVertical:12,borderTopWidth:1,borderColor:theme.colors.border}}>
        <Text style={{color:theme.colors.brandStrong,fontWeight:'800'}}>{place.kind==='favorite'?'FAVORITE':place.kind.toUpperCase()}</Text>
        <Text style={{color:theme.colors.ink,fontSize:18,fontWeight:'700'}}>{place.label}</Text>
        <Text style={{color:theme.colors.inkMuted}}>{place.address}</Text>
        <Text style={{color:theme.colors.inkMuted}}>{place.attribution}</Text>
        <ActionButton title={`Navigate to ${place.label}`} onPress={()=>{setPickedDestination({name:place.label,detail:place.address,coordinate:[place.lon,place.lat]});router.navigate('/(tabs)/map');}}/>
        <ActionButton title={`Remove ${place.label}`} secondary onPress={()=>{void updateDriverData(d=>({...d,places:d.places.filter(p=>p.clientKey!==place.clientKey)})).then(()=>setMessage('Removed from this phone. Account copies change only when you sync.')).catch(()=>setMessage('Could not remove the saved place.'));}}/>
      </View>)}
      {!!message&&<Text accessibilityLiveRegion="polite" style={{color:theme.colors.inkMuted}}>{message}</Text>}
    </Surface>
  </ContentFrame></Page>;
}