import { useCallback, useRef } from 'react';
import { Alert, BackHandler, Keyboard, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useScrollMenu } from './ScrollMenuContext';

export function HomeBackGuard() {
  const showing = useRef(false);
  const { setHidden } = useScrollMenu();
  useFocusEffect(useCallback(() => {
    setHidden(false);
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (Keyboard.isVisible()) { Keyboard.dismiss(); return true; }
      if (router.canGoBack()) return false;
      if (!showing.current) {
        showing.current = true;
        const dismiss = () => { showing.current = false; };
        Alert.alert('Exit ROVA?', 'You can stay here to plan your journey.', [
          { text: 'Stay', style: 'cancel', onPress: dismiss },
          { text: 'Exit', onPress: () => { dismiss(); BackHandler.exitApp(); } },
        ], { cancelable: true, onDismiss: dismiss });
      }
      return true;
    });
    return () => { showing.current = false; subscription.remove(); };
  }, [setHidden]));
  return null;
}
