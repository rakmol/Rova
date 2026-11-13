import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, ContentFrame, Page, PageHeader, Pill, Surface } from '../../components/ui';
import { RovaIcon } from '../../components/RovaIcon';
import { useRovaTheme } from '../../theme/ThemeProvider';
import { useRoutePreview } from '../../map/RouteProvider';
import { updateDriverData, useDriverData } from '../../account/local';
export default function SavedScreen(){
  const {theme}=useRovaTheme();const {setPickedDestination}=useRoutePreview();const data=useDriverData();const [message,setMessage]=useState('');
  return <Page><ContentFrame>
    <PageHeader eyebrow="Your places" title="Saved" subtitle="Home, Work and favorites. Sign-in is optional."/>
    <Surface style={styles.intro}>
      <View style={[styles.introIcon,{backgroundColor:theme.colors.brandTint}]}>
        <RovaIcon name="saved" color={theme.colors.brandStrong} size={22}/>
      </View>
      <Text style={[styles.copy,{color:theme.colors.inkMuted}]}>Your everyday places, ready when you need them. Search a place to save it as Home, Work or a favorite.</Text>
      <ActionButton title="Find a place to save" onPress={()=>router.push('/destination-search')}/>
    </Surface>
    {!data.places.length&&<Surface style={styles.empty}>
      <Text style={[styles.placeTitle,{color:theme.colors.ink}]}>Nothing saved yet</Text>
      <Text style={[styles.copy,{color:theme.colors.inkMuted}]}>Places you save on this phone will appear here.</Text>
    </Surface>}
    {data.places.map(place=><Surface key={place.clientKey} style={styles.place}>
        <View style={styles.placeHeading}>
          <Pill>{place.kind==='favorite'?'FAVORITE':place.kind.toUpperCase()}</Pill>
          <RovaIcon name="saved" color={theme.colors.brandStrong} size={20}/>
        </View>
        <Text style={[styles.placeTitle,{color:theme.colors.ink}]}>{place.label}</Text>
        <Text style={[styles.copy,{color:theme.colors.inkMuted}]}>{place.address}</Text>
        <Text style={[styles.attribution,{color:theme.colors.inkSubtle}]}>{place.attribution}</Text>
        <ActionButton title={`Navigate to ${place.label}`} onPress={()=>{setPickedDestination({name:place.label,detail:place.address,coordinate:[place.lon,place.lat]});router.navigate('/(tabs)/map');}}/>
        <ActionButton title={`Remove ${place.label}`} secondary onPress={()=>{void updateDriverData(d=>({...d,places:d.places.filter(p=>p.clientKey!==place.clientKey)})).then(()=>setMessage('Removed from this phone. Account copies change only when you sync.')).catch(()=>setMessage('Could not remove the saved place.'));}}/>
      </Surface>)}
      {!!message&&<Text accessibilityLiveRegion="polite" style={{color:theme.colors.inkMuted}}>{message}</Text>}
      <Text style={[styles.attribution,{color:theme.colors.inkMuted}]}>Saved on this phone. Optional account backup is available in Settings.</Text>
  </ContentFrame></Page>;
}
const styles = StyleSheet.create({
  intro:{gap:14,marginBottom:16},
  introIcon:{width:44,height:44,borderRadius:15,alignItems:'center',justifyContent:'center'},
  place:{gap:10,marginBottom:12},
  placeHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  placeTitle:{fontSize:19,lineHeight:26,fontWeight:'800'},
  copy:{fontSize:15,lineHeight:22},
  attribution:{fontSize:13,lineHeight:19},
  empty:{gap:8,marginBottom:12},
});
