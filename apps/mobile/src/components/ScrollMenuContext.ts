import { createContext, useContext } from 'react';
export const ScrollMenuContext = createContext({ height: 0, setHidden: (_hidden: boolean) => {} });
export const useScrollMenu = () => useContext(ScrollMenuContext);
