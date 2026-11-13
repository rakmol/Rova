import { act, render } from '@testing-library/react-native';
import { Alert, BackHandler, Keyboard, Platform } from 'react-native';
import { router } from 'expo-router';
import { HomeBackGuard } from '../components/HomeBackGuard';
jest.mock('expo-router',()=>{
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React=require('react');
  return {router:{canGoBack:jest.fn(()=>false)},useFocusEffect:(callback:()=>void)=>React.useEffect(callback,[callback])};
});
test('home Back confirms exit, preserves normal back navigation and cleans up its listener',async()=>{
  jest.replaceProperty(Platform,'OS','android');
  let back!:()=>boolean|null|undefined;
  const remove=jest.fn(),exit=jest.spyOn(BackHandler,'exitApp').mockImplementation(()=>{});
  jest.spyOn(BackHandler,'addEventListener').mockImplementation((_,fn)=>{back=fn;return{remove};});
  jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);
  const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
  const view=await render(<HomeBackGuard/>);
  try {
    await act(()=>{expect(back()).toBe(true);});
    expect(exit).not.toHaveBeenCalled();
    const buttons=alert.mock.calls[0][2]!;
    await act(()=>buttons.find(b=>b.text==='Stay')!.onPress!());
    expect(exit).not.toHaveBeenCalled();
    await act(()=>{back();});
    await act(()=>alert.mock.calls.at(-1)![2]!.find(b=>b.text==='Exit')!.onPress!());
    expect(exit).toHaveBeenCalledTimes(1);
    jest.mocked(router.canGoBack).mockReturnValue(true);expect(back()).toBe(false);
  } finally { await view.unmount();expect(remove).toHaveBeenCalled();jest.restoreAllMocks(); }
});
