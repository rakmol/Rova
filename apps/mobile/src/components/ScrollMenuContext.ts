import { createContext, useContext } from 'react';
import type {Animated} from 'react-native';
type ScrollMenuValue={height:number;setHidden:(hidden:boolean)=>void;bottomInset?:Animated.AnimatedInterpolation<number>;hidden?:boolean;safeBottom?:number};
export const ScrollMenuContext = createContext<ScrollMenuValue>({ height: 0, setHidden: (_hidden: boolean) => {} });
export const useScrollMenu = () => useContext(ScrollMenuContext);
