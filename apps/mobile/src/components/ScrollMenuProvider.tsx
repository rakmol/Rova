import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from 'expo-router/js-tabs';
import { ScrollMenuContext, useScrollMenu } from './ScrollMenuContext';

export function ScrollMenuProvider({ height, children }: { height: number; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [screenReader, setScreenReader] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (active) setScreenReader(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { active = false; sub.remove(); };
  }, []);
  const value = useMemo(() => ({ height, setHidden }), [height]);
  return <ScrollMenuContext.Provider value={value}><Visibility.Provider value={hidden && !screenReader}>{children}</Visibility.Provider></ScrollMenuContext.Provider>;
}
const Visibility = createContext(false);
export function ScrollTabBar(props: BottomTabBarProps) {
  const hidden = useContext(Visibility), { height, setHidden } = useScrollMenu();
  const [translateY] = useState(() => new Animated.Value(0));
  useEffect(() => { setHidden(false); }, [props.state.index, setHidden]);
  useEffect(() => {
    const animation = Animated.timing(translateY, { toValue: hidden ? height : 0, duration: 180, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [hidden, height, translateY]);
  return <Animated.View testID="scroll-tab-bar" pointerEvents={hidden ? 'none' : 'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, transform: [{ translateY }] }}><BottomTabBar {...props} /></Animated.View>;
}
