import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RovaIcon } from './RovaIcon';
import { useRovaTheme } from '../theme/ThemeProvider';
export function ScreenTopBar({title,onBack,backLabel='Back'}:{title:string;onBack:()=>void;backLabel?:string}){
 const {theme}=useRovaTheme();
 return <View style={styles.bar}><Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={[styles.back,{backgroundColor:theme.colors.surfaceRaised}]}><RovaIcon name="back" color={theme.colors.ink}/></Pressable><Text accessibilityRole="header" style={[styles.title,{color:theme.colors.ink}]}>{title}</Text></View>;
}
const styles=StyleSheet.create({bar:{minHeight:64,flexDirection:'row',alignItems:'center',gap:14,marginBottom:12,marginTop:4},back:{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center'},title:{flex:1,fontSize:22,fontWeight:'700'}});
