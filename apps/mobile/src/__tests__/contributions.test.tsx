import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {BackHandler,Keyboard} from 'react-native';
import ContributeScreen from '../app/(tabs)/contribute';
import {ThemeProvider} from '../theme/ThemeProvider';
import {myContributions,submitContribution} from '../contributions/client';
jest.mock('expo-router',()=>({router:{push:jest.fn()},
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}));
jest.mock('../map/mapboxProvider',()=>({accraDevelopmentCenter:[-.2,5.6],mapboxProvider:{initialize:async()=>{}}}));
jest.mock('../map/MapboxMap',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const {View,Pressable,Text}=require('react-native');
 return {MapboxMap:({onPickCoordinate}:{onPickCoordinate:(p:[number,number])=>void})=><View><Pressable accessibilityRole="button" accessibilityLabel="Pick fixture point" onPress={()=>onPickCoordinate([-.21,5.61])}><Text>Fixture map only</Text></Pressable></View>};});
jest.mock('../contributions/client',()=>({myContributions:jest.fn(),submitContribution:jest.fn()}));
beforeEach(()=>{jest.mocked(myContributions).mockResolvedValue([]);jest.mocked(submitContribution).mockResolvedValue({id:'test-only',duplicate:false,authorityVerified:false} as never);});
test('a guest chooses an explicit map point and parked mode before sending a pending place proposal',async()=>{
 const view=await render(<ThemeProvider><ContributeScreen/></ThemeProvider>);
 try{
  await fireEvent.press(view.getByRole('button',{name:'Add a place'}));
  expect(view.queryByLabelText('Contribution name')).toBeNull();
  await fireEvent.press(view.getByRole('button',{name:"I'm safely parked"}));
  expect(view.getByRole('button',{name:'Send for review'}).props.accessibilityState.disabled).toBe(true);
  await fireEvent.changeText(view.getByLabelText('Contribution name'),'TEST ONLY market');
  await fireEvent.press(view.getByRole('radio',{name:'Market'}));
  await fireEvent.press(view.getByRole('button',{name:'Pick fixture point'}));
  await fireEvent.press(view.getByRole('button',{name:'Send for review'}));
  await waitFor(()=>expect(submitContribution).toHaveBeenCalledWith({kind:'place',name:'TEST ONLY market',category:'market',lon:-.21,lat:5.61,note:'',direction:'',interaction:'parked'}));
  await waitFor(()=>expect(view.getByText('Sent for review. Thank you for helping improve ROVA.')).toBeTruthy());
 }finally{await view.unmount();}
});
test('equipment reports offer unknown type, never mobile cameras; Back closes the form and leaves navigation to tab history',async()=>{
 let back!:()=>boolean|null|undefined;
 const listener=jest.spyOn(BackHandler,'addEventListener').mockImplementation((_,fn)=>{back=fn;return{remove:jest.fn()};});
 const keyboard=jest.spyOn(Keyboard,'isVisible').mockReturnValue(false);
 const view=await render(<ThemeProvider><ContributeScreen/></ThemeProvider>);
 try{
  await fireEvent.press(view.getByRole('button',{name:'Report fixed enforcement equipment'}));
  await fireEvent.press(view.getByRole('button',{name:"I'm a passenger"}));
  expect(view.getByRole('radio',{name:'Equipment type unknown'}).props.accessibilityState.checked).toBe(true);
  expect(view.queryByRole('radio',{name:/mobile/i})).toBeNull();
  await act(()=>{expect(back()).toBe(true);});expect(view.getByRole('button',{name:'Add a place'})).toBeTruthy();expect(back()).toBe(false);
 }finally{await view.unmount();listener.mockRestore();keyboard.mockRestore();}
});
