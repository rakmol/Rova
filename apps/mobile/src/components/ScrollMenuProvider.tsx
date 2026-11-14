import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Keyboard } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { ScrollMenuContext, useScrollMenu } from './ScrollMenuContext';

export function ScrollMenuProvider({ height, safeBottom=0, children }: { height: number; safeBottom?:number; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [screenReader, setScreenReader] = useState(true);
  const [keyboard,setKeyboard]=useState(false);
  const [visibility]=useState(()=>new Animated.Value(1));
  const effectiveHidden=keyboard||(hidden&&!screenReader);
  useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true)),hide=Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));return()=>{show.remove();hide.remove();};},[]);
  useEffect(()=>{const animation=Animated.timing(visibility,{toValue:effectiveHidden?0:1,duration:200,useNativeDriver:false});animation.start();return()=>animation.stop();},[effectiveHidden,visibility]);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (active) setScreenReader(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; sub.remove(); };
  }, []);
  const bottomInset=useMemo(()=>visibility.interpolate({inputRange:[0,1],outputRange:[safeBottom,height]}),[visibility,safeBottom,height]);
  const value = useMemo(() => ({ height, setHidden,bottomInset,hidden:effectiveHidden,safeBottom }), [height,bottomInset,effectiveHidden,safeBottom]);
  const presentation=useMemo(()=>({hidden:effectiveHidden,opacity:visibility}),[effectiveHidden,visibility]);
  return <ScrollMenuContext.Provider value={value}><Visibility.Provider value={presentation}>{children}</Visibility.Provider></ScrollMenuContext.Provider>;
}
const Visibility = createContext<{hidden:boolean;opacity:Animated.Value|number}>({hidden:false,opacity:1});
export function ScrollTabBar(props: BottomTabBarProps) {
  const {hidden,opacity} = useContext(Visibility), { setHidden } = useScrollMenu();
  useEffect(() => { setHidden(false); }, [props.state.index, setHidden]);
  return <Animated.View testID="scroll-tab-bar" pointerEvents={hidden ? 'none' : 'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, opacity }}><BottomTabBar {...props} /></Animated.View>;
}
