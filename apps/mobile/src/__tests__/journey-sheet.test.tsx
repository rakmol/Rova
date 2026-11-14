import {act,fireEvent,render} from '@testing-library/react-native';
import {Animated,PanResponder,ScrollView,Text,type PanResponderCallbacks,type PanResponderGestureState} from 'react-native';
import {JourneySheet} from '../components/JourneySheet';
import {ThemeProvider} from '../theme/ThemeProvider';
import {ScrollMenuContext} from '../components/ScrollMenuContext';
import {clampSheet,settleSheet,sheetStops} from '../components/journeySheetGeometry';
jest.mock('react-native-safe-area-context',()=>({...jest.requireActual('react-native-safe-area-context'),useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})}));

test('sheet stops preserve controls on small/large text screens and drag directions select a lower or higher stop',()=>{
 for(const height of [360,640,844])for(const scale of [1,2]){
  const stops=sheetStops(height,scale,24,90,76);
  expect(stops.peek).toBeLessThanOrEqual(stops.compact);expect(stops.compact).toBeLessThanOrEqual(stops.expanded);
  expect(clampSheet(-200,stops)).toBe(stops.peek);expect(clampSheet(2000,stops)).toBe(stops.expanded);
  expect(stops[settleSheet(stops.expanded,80,.2,stops)]).toBeLessThanOrEqual(stops.compact);
  expect(stops[settleSheet(stops.peek,-80,-.2,stops)]).toBeGreaterThanOrEqual(stops.compact);
 }
});
test('drag handle resizes during the gesture, snaps both ways, and keeps the footer mounted',async()=>{
 let gesture!:PanResponderCallbacks;const original=PanResponder.create;
 jest.spyOn(PanResponder,'create').mockImplementation(config=>{gesture=config;return original(config);});
 jest.spyOn(Animated,'timing').mockImplementation((value,config)=>({start:done=>{(value as Animated.Value).setValue(config.toValue as number);done?.({finished:true});},stop:jest.fn(),reset:jest.fn()}));
 const changes=jest.spyOn(Animated.Value.prototype,'setValue'),setHidden=jest.fn(),settled=jest.fn();
 const event={} as never,g=(dy:number,vy=0)=>({dy,dx:0,vy} as PanResponderGestureState);
 const view=await render(<ThemeProvider><ScrollMenuContext.Provider value={{height:90,setHidden}}><JourneySheet onSettled={settled} footer={<Text>Start navigation fixture</Text>}><ScrollView><Text>Journey content</Text></ScrollView></JourneySheet></ScrollMenuContext.Provider></ThemeProvider>);
 try{
  expect(gesture.onMoveShouldSetPanResponderCapture?.(event,g(20))).toBe(true);
  const initial=settled.mock.calls.at(-1)![0];changes.mockClear();
  await act(()=>{gesture.onPanResponderGrant?.(event,g(0));gesture.onPanResponderMove?.(event,g(60));});
  expect(changes.mock.calls.at(-1)![0]).toBeLessThan(initial);
  await act(()=>{gesture.onPanResponderRelease?.(event,g(200,.5));});
  expect(settled.mock.calls.at(-1)![0]).toBeLessThan(initial);expect(view.getByText('Start navigation fixture')).toBeTruthy();
  const low=settled.mock.calls.at(-1)![0];
  await act(()=>{gesture.onPanResponderGrant?.(event,g(0));gesture.onPanResponderMove?.(event,g(-300));gesture.onPanResponderRelease?.(event,g(-300,-.5));});
  expect(settled.mock.calls.at(-1)![0]).toBeGreaterThan(low);
  expect(setHidden).not.toHaveBeenCalledWith(true);
  if(view.queryByRole('button',{name:'Collapse journey panel'}))await fireEvent.press(view.getByRole('button',{name:'Collapse journey panel'}));
  expect(view.getByRole('button',{name:'Expand journey panel'})).toBeTruthy();
 }finally{await view.unmount();jest.restoreAllMocks();}
});
