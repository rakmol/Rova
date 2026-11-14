import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Animated,PanResponder,Pressable,StyleSheet,View,useWindowDimensions} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useRovaTheme} from '../theme/ThemeProvider';
import {useScrollMenu} from './ScrollMenuContext';
import {clampSheet,settleSheet,sheetStops,type SheetLevel} from './journeySheetGeometry';

export function JourneySheet({children,footer,initialExpanded=false,onSettled}:{children:ReactNode;footer?:ReactNode;initialExpanded?:boolean;onSettled:(height:number)=>void}){
 const {theme}=useRovaTheme(),{height:screenHeight,fontScale}=useWindowDimensions(),insets=useSafeAreaInsets(),{height:menuHeight,setHidden}=useScrollMenu();
 const [footerHeight,setFooterHeight]=useState(footer?96:0);
 const stops=useMemo(()=>sheetStops(screenHeight,fontScale,insets.top,menuHeight,footerHeight),[screenHeight,fontScale,insets.top,menuHeight,footerHeight]);
 const [level,setLevel]=useState<SheetLevel>(initialExpanded?'expanded':'compact');
 const [height]=useState(()=>new Animated.Value(stops[level]));
 const current=useRef(stops[level]),start=useRef(stops[level]);
 useEffect(()=>{const token=height.addListener(({value})=>{current.current=value;});return()=>height.removeListener(token);},[height]);
 useEffect(()=>{const target=stops[level];const animation=Animated.timing(height,{toValue:target,duration:180,useNativeDriver:false});animation.start(({finished})=>{if(finished)onSettled(target);});return()=>animation.stop();},[height,level,stops,onSettled]);
 const gesture=useMemo(()=>{
  const settle=(next:SheetLevel)=>{if(next===level)Animated.timing(height,{toValue:stops[next],duration:180,useNativeDriver:false}).start(({finished})=>{if(finished)onSettled(stops[next]);});else setLevel(next);};
  // PanResponder registers these callbacks; refs are read only when a gesture arrives.
  // eslint-disable-next-line react-hooks/refs
  return PanResponder.create({
   onMoveShouldSetPanResponderCapture:(_event,g)=>Math.abs(g.dy)>6&&Math.abs(g.dy)>Math.abs(g.dx),
   onPanResponderGrant:()=>{height.stopAnimation();start.current=current.current;setHidden(false);},
   onPanResponderMove:(_event,g)=>height.setValue(clampSheet(start.current-g.dy,stops)),
   onPanResponderRelease:(_event,g)=>settle(settleSheet(start.current,g.dy,g.vy,stops)),
   onPanResponderTerminate:()=>settle(settleSheet(current.current,0,0,stops)),
  });
 },[height,level,stops,onSettled,setHidden]);
 return <Animated.View testID="journey-sheet" style={[styles.sheet,{height,backgroundColor:theme.colors.surface}]}>
  <View testID="journey-sheet-drag" {...gesture.panHandlers}>
   <Pressable accessibilityRole="button" accessibilityLabel={level==='expanded'?'Collapse journey panel':'Expand journey panel'} accessibilityHint="Drag up or down to resize, or double tap to expand or collapse." accessibilityState={{expanded:level==='expanded'}} onPress={()=>{setLevel(level==='expanded'?'peek':'expanded');setHidden(false);}} style={styles.touch}><View style={[styles.handle,{backgroundColor:theme.colors.border}]}/></Pressable>
  </View>
  {children}
  {!!footer&&<View onLayout={event=>setFooterHeight(event.nativeEvent.layout.height)}>{footer}</View>}
 </Animated.View>;
}
const styles=StyleSheet.create({sheet:{borderTopLeftRadius:28,borderTopRightRadius:28,overflow:'hidden',flexShrink:0,boxShadow:'0 -2px 16px rgba(0,0,0,.10)'},touch:{height:48,alignItems:'center',justifyContent:'center'},handle:{width:42,height:5,borderRadius:3}});
