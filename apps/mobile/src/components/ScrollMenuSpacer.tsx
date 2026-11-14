import {Animated} from 'react-native';
import {useScrollMenu} from './ScrollMenuContext';
export function ScrollMenuSpacer(){const menu=useScrollMenu();return <Animated.View testID="scroll-menu-space" pointerEvents="none" style={{height:menu.bottomInset??menu.height}}/>;}
