import {useEffect,useState} from 'react';
import {Keyboard,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {placesProvider} from '../places/runtime';
import type {Place,Coordinate} from '../places/provider';
import {useRovaTheme} from '../theme/ThemeProvider';
import {ActionButton} from '../components/ui';

export function ContributionPlaceSearch({value,onChange,onSelect,disabled,bias,maxHeight=240,onFocus,onBlur}:{value:string;onChange:(text:string)=>void;onSelect:(place:Place)=>void;disabled:boolean;bias:Coordinate;maxHeight?:number;onFocus:()=>void;onBlur:()=>void}){
 const {theme}=useRovaTheme();const [focused,setFocused]=useState(false),[results,setResults]=useState<Place[]>([]),[status,setStatus]=useState<'idle'|'loading'|'done'|'error'>('idle'),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const lon=bias[0],lat=bias[1];
 useEffect(()=>{
  if(!focused||disabled||value.trim().length<2)return;
  const controller=new AbortController();const timer=setTimeout(()=>{
   setStatus('loading');setError('');
   placesProvider.autocomplete(value,[lon,lat],controller.signal).then(rows=>{if(!controller.signal.aborted){setResults(rows.slice(0,6));setStatus('done');}}).catch(e=>{if(!controller.signal.aborted){setResults([]);setStatus('error');setError(e instanceof Error?e.message:'Search unavailable. Choose the observed point on the map instead.');}});
  },200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[value,focused,disabled,lon,lat,retry]);
 const shown=focused&&!disabled&&value.trim().length>=2;
 return <View style={{gap:8}}>
  <TextInput accessibilityLabel="Contribution name" accessibilityHint="Type a road, landmark or place name for suggestions. You can also enter an unlisted place." value={value} onChangeText={text=>{setResults([]);setStatus(text.trim().length>=2?'loading':'idle');setError('');onChange(text);}} onFocus={()=>{setFocused(true);onFocus();}} onBlur={()=>{setFocused(false);onBlur();}} maxLength={120} placeholder="Search a road, landmark or place" placeholderTextColor={theme.colors.inkSubtle} autoCorrect={false} style={[styles.input,{color:theme.colors.ink,borderColor:theme.colors.border}]} editable={!disabled}/>
  {shown&&<View>
   {status==='loading'&&<Text accessibilityLiveRegion="polite" style={{color:theme.colors.inkMuted}}>Searching places...</Text>}
   {status==='error'&&<><Text accessibilityRole="alert" style={{color:theme.colors.danger}}>{error}</Text><ActionButton title="Retry location suggestions" secondary onPress={()=>setRetry(n=>n+1)}/></>}
   {status==='done'&&results.length===0&&<Text style={{color:theme.colors.inkMuted}}>No suggestions found. Keep the name you observed and choose its exact point on the map.</Text>}
   {!!results.length&&<><ScrollView testID="contribution-place-suggestions" keyboardShouldPersistTaps="always" keyboardDismissMode="none" nestedScrollEnabled style={{maxHeight}}>{results.map(place=><Pressable key={place.id} accessibilityRole="button" accessibilityLabel={'Use area '+place.name} onPress={()=>{setFocused(false);setResults([]);onBlur();Keyboard.dismiss();onSelect(place);}} style={[styles.result,{borderColor:theme.colors.divider}]}><Text style={{color:theme.colors.ink,fontWeight:'700',fontSize:16}}>{place.name}</Text><Text style={{color:theme.colors.inkMuted}}>{place.detail}</Text></Pressable>)}</ScrollView><Text style={{color:theme.colors.inkMuted,fontSize:12}}>{results[0].attribution}</Text></>}
  </View>}
 </View>;
}
const styles=StyleSheet.create({input:{borderWidth:1,borderRadius:14,padding:14,minHeight:52,fontSize:16},result:{paddingVertical:12,minHeight:64,borderBottomWidth:StyleSheet.hairlineWidth,gap:4}});
