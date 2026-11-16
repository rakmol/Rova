import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {Alert,Platform} from 'react-native';
import {BackgroundNavigationSettings} from '../navigation/BackgroundNavigationSettings';
import {enableBackgroundNavigation} from '../navigation/background-location';
import * as Notifications from 'expo-notifications';
jest.mock('../navigation/background-location',()=>({backgroundPermission:async()=>false,enableBackgroundNavigation:jest.fn(async()=>{})}));
jest.mock('../theme/ThemeProvider',()=>({useRovaTheme:()=>({theme:jest.requireActual('../theme/theme').resolveTheme('light','light')})}));
jest.mock('expo-notifications',()=>({getPermissionsAsync:jest.fn(async()=>({granted:false})),requestPermissionsAsync:jest.fn(async()=>({granted:true}))}));
test('background and navigation-notification permissions are requested only after the user accepts the explanation',async()=>{
 const original=Platform.OS;Object.defineProperty(Platform,'OS',{value:'android',configurable:true});const alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
 const view=await render(<BackgroundNavigationSettings/>);
 try{
  expect(enableBackgroundNavigation).not.toHaveBeenCalled();expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button',{name:'Enable background navigation'}));expect(enableBackgroundNavigation).not.toHaveBeenCalled();expect(alert.mock.calls[0][1]).toContain('does not save a continuous travel history');
  const continuation=alert.mock.calls[0][2]!.find(b=>b.text==='Continue')!;
  await act(async()=>continuation.onPress!());await waitFor(()=>expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1));expect(enableBackgroundNavigation).toHaveBeenCalledTimes(1);
 }finally{await view.unmount();alert.mockRestore();Object.defineProperty(Platform,'OS',{value:original,configurable:true});}
});
