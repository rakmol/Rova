import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {AppState,BackHandler,Keyboard} from 'react-native';
import ContributeScreen from '../app/(tabs)/contribute';
import {ThemeProvider} from '../theme/ThemeProvider';
import {myContributions,submitContribution} from '../contributions/client';
import {submitIncident,nearbyIncidents} from '../incidents/client';
import * as Location from 'expo-location';
jest.mock('../incidents/NearbyHazards',()=>({NearbyHazards:()=>null}));
jest.mock('../incidents/client',()=>({submitIncident:jest.fn(),nearbyIncidents:jest.fn(),voteIncident:jest.fn(),canInteract:jest.fn(()=>true)}));
jest.mock('expo-location',()=>({getForegroundPermissionsAsync:jest.fn(),hasServicesEnabledAsync:jest.fn(),requestForegroundPermissionsAsync:jest.fn(),getCurrentPositionAsync:jest.fn(),Accuracy:{High:4}}));
jest.mock('expo-router',()=>({router:{push:jest.fn()},
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 useFocusEffect:(callback:()=>void)=>require('react').useEffect(callback,[callback])}));
jest.mock('../map/mapboxProvider',()=>({accraDevelopmentCenter:[-.2,5.6],mapboxProvider:{initialize:async()=>{}}}));
jest.mock('../map/MapboxMap',()=>{
 // eslint-disable-next-line @typescript-eslint/no-require-imports
 const {View,Pressable,Text}=require('react-native');
 return {MapboxMap:({onPickCoordinate}:{onPickCoordinate:(p:[number,number])=>void})=><View><Pressable accessibilityRole="button" accessibilityLabel="Pick fixture point" onPress={()=>onPickCoordinate([-.21,5.61])}><Text>Fixture map only</Text></Pressable></View>};});
jest.mock('../contributions/client',()=>({myContributions:jest.fn(),submitContribution:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(AppState,'addEventListener').mockImplementation(()=>({remove:jest.fn()}));jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true} as never);jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);jest.mocked(myContributions).mockResolvedValue([]);jest.mocked(submitContribution).mockResolvedValue({id:'test-only',duplicate:false,authorityVerified:false} as never);});
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
  expect(view.getByText('Thank you for contributing')).toBeTruthy();
  await fireEvent.press(view.getByRole('button',{name:'Report another'}));
  expect(view.getByLabelText('Contribution name')).toBeTruthy();
  expect(view.queryByRole('button',{name:"I'm safely parked"})).toBeNull();
 }finally{await view.unmount();}
});

test('road-problem submission stays inside Contribute with the selected interaction mode',async()=>{
 jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({status:'granted'} as never);
 jest.mocked(Location.getCurrentPositionAsync).mockImplementation(async()=>({coords:{longitude:-.2,latitude:5.6,accuracy:8,speed:0},timestamp:Date.now()}) as never);
 jest.mocked(submitIncident).mockResolvedValue({id:'test-only',duplicate:false});jest.mocked(nearbyIncidents).mockResolvedValue([]);
 const view=await render(<ThemeProvider><ContributeScreen/></ThemeProvider>);
 try{
  await fireEvent.press(view.getByRole('button',{name:'Report a road problem'}));
  expect(view.getByText('Road reports')).toBeTruthy();
  await fireEvent.press(view.getByRole('button',{name:"I'm safely parked"}));
  await fireEvent.press(view.getByRole('button',{name:'Pothole'}));
  await waitFor(()=>expect(view.getByText('Report submitted for review. Thank you.')).toBeTruthy());
  expect(view.getByRole('button',{name:'Parked selected'})).toBeTruthy();
  expect(view.getByRole('button',{name:'Pothole'})).toBeTruthy();
  expect(view.queryByRole('button',{name:'Add a place'})).toBeNull();
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

test('Use my position keeps the equipment draft and map through Android permission activity and background recovery',async()=>{
 const listeners:((state:string)=>void)[]=[];
 const subscription=jest.spyOn(AppState,'addEventListener').mockImplementation((type,fn)=>{if(type==='change')listeners.push(fn as (state:string)=>void);return{remove:jest.fn()};});
 let resolve!:(fix:Location.LocationObject)=>void;
 jest.mocked(Location.getCurrentPositionAsync).mockImplementation(()=>new Promise(done=>{resolve=done;}));
 const view=await render(<ThemeProvider><ContributeScreen/></ThemeProvider>);
 try{
  await fireEvent.press(view.getByRole('button',{name:'Report fixed enforcement equipment'}));
  await fireEvent.press(view.getByRole('button',{name:"I'm safely parked"}));
  await fireEvent.changeText(view.getByLabelText('Contribution name'),'TEST ONLY equipment');
  await fireEvent.changeText(view.getByLabelText('Contribution details'),'Keep this observation');
  await fireEvent.press(view.getByRole('button',{name:'Use my current position as the pin'}));
  await waitFor(()=>expect(resolve).toBeDefined());
  await act(()=>{listeners.forEach(fn=>fn('background'));listeners.forEach(fn=>fn('active'));});
  await act(()=>resolve({coords:{longitude:-.22,latitude:5.62,accuracy:8},timestamp:Date.now()} as Location.LocationObject));
  await waitFor(()=>expect(view.getByText('Position selected. Check the pin before sending.')).toBeTruthy());
  expect(view.getByLabelText('Contribution name').props.value).toBe('TEST ONLY equipment');
  expect(view.getByLabelText('Contribution details').props.value).toBe('Keep this observation');
  expect(view.getByRole('button',{name:'Pick fixture point'})).toBeTruthy();
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(view.getByText('Selected pin: 5.62000, -0.22000')).toBeTruthy();
  await act(()=>{listeners.forEach(fn=>fn('background'));listeners.forEach(fn=>fn('active'));});
  expect(view.getByLabelText('Contribution name').props.editable).toBe(false);
  expect(view.getByText('Selected pin: 5.62000, -0.22000')).toBeTruthy();
  expect(view.getByRole('button',{name:'Send for review'}).props.accessibilityState.disabled).toBe(true);
  await fireEvent.press(view.getByRole('button',{name:"I'm safely parked"}));
  expect(view.getByLabelText('Contribution name').props.value).toBe('TEST ONLY equipment');
 }finally{await view.unmount();subscription.mockRestore();}
});

test('permission refusal and imprecise GPS retain the manual pin and draft; leaving ignores a late GPS result',async()=>{
 jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:false} as never);
 jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({granted:false} as never);
 const view=await render(<ThemeProvider><ContributeScreen/></ThemeProvider>);
 try{
  await fireEvent.press(view.getByRole('button',{name:'Add a place'}));
  await fireEvent.press(view.getByRole('button',{name:"I'm safely parked"}));
  await fireEvent.changeText(view.getByLabelText('Contribution name'),'TEST ONLY draft');
  await fireEvent.press(view.getByRole('button',{name:'Pick fixture point'}));
  await fireEvent.press(view.getByRole('button',{name:'Use my current position as the pin'}));
  await waitFor(()=>expect(view.getByText(/Location permission is off/)).toBeTruthy());
  expect(view.getByText('Selected pin: 5.61000, -0.21000')).toBeTruthy();
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true} as never);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({coords:{longitude:-.22,latitude:5.62,accuracy:90},timestamp:Date.now()} as Location.LocationObject);
  await fireEvent.press(view.getByRole('button',{name:'Use my current position as the pin'}));
  await waitFor(()=>expect(view.getByText(/Location is imprecise/)).toBeTruthy());
  expect(view.getByLabelText('Contribution name').props.value).toBe('TEST ONLY draft');
  expect(view.getByText('Selected pin: 5.61000, -0.21000')).toBeTruthy();
  let resolve!:(fix:Location.LocationObject)=>void;
  jest.mocked(Location.getCurrentPositionAsync).mockImplementation(()=>new Promise(done=>{resolve=done;}));
  await fireEvent.press(view.getByRole('button',{name:'Use my current position as the pin'}));
  await waitFor(()=>expect(resolve).toBeDefined());
  await fireEvent.press(view.getByRole('button',{name:'All contributions'}));
  await fireEvent.press(view.getByRole('button',{name:'Report fixed enforcement equipment'}));
  await act(()=>resolve({coords:{longitude:-.22,latitude:5.62,accuracy:8},timestamp:Date.now()} as Location.LocationObject));
  expect(view.getByText('Select a pin before submitting.')).toBeTruthy();
  expect(view.getByLabelText('Contribution name').props.value).toBe('');
 }finally{await view.unmount();}
});

test('a failed submission keeps the draft and a saved submission is not described as failed when history cannot refresh',async()=>{
 jest.mocked(submitContribution).mockRejectedValueOnce(new Error('Network unavailable. Retry when connected.'));
 const view=await render(<ThemeProvider><ContributeScreen/></ThemeProvider>);
 try{
  await fireEvent.press(view.getByRole('button',{name:'Add a place'}));await fireEvent.press(view.getByRole('button',{name:"I'm safely parked"}));
  await fireEvent.changeText(view.getByLabelText('Contribution name'),'TEST ONLY network draft');await fireEvent.press(view.getByRole('button',{name:'Pick fixture point'}));
  await fireEvent.press(view.getByRole('button',{name:'Send for review'}));await waitFor(()=>expect(view.getByText('Network unavailable. Retry when connected.')).toBeTruthy());
  expect(view.getByLabelText('Contribution name').props.value).toBe('TEST ONLY network draft');expect(view.getByText('Selected pin: 5.61000, -0.21000')).toBeTruthy();
  jest.mocked(myContributions).mockRejectedValueOnce(new Error('History request unavailable'));
  await fireEvent.press(view.getByRole('button',{name:'Send for review'}));await waitFor(()=>expect(view.getByText('Sent for review. Your contributions list could not refresh; do not send again.')).toBeTruthy());
  expect(view.getByText('Thank you for contributing')).toBeTruthy();expect(submitContribution).toHaveBeenCalledTimes(2);
 }finally{await view.unmount();}
});
