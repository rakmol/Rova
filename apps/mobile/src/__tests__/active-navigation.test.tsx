import {useState,useEffect} from 'react';
import {Text,Button,AppState} from 'react-native';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {ActiveNavigationProvider,useActiveNavigation} from '../navigation/ActiveNavigationProvider';
import {RouteProvider,useRoutePreview} from '../map/RouteProvider';
import {clearJourneyCheckpoint,eraseActiveJourney,loadJourneyCheckpoint,saveJourneyCheckpoint,validateJourneyCheckpoint} from '../navigation/journey-checkpoint';
import {routingProvider} from '../routing/runtime';
import * as Location from 'expo-location';
import type {RoutingOption} from '@rova/shared';
const mockStart=jest.fn(),mockStop=jest.fn(),mockCleanup=jest.fn();
jest.mock('../navigation/useNavigationSession',()=>({useNavigationSession:(destination:unknown,selected:unknown)=>{
 const React=jest.requireActual('react');React.useEffect(()=>{if(destination)mockStart(destination,selected);return()=>{if(destination)mockCleanup();};},[destination,selected]);
 return {snapshot:{state:'navigating'},stop:mockStop};
}}));
jest.mock('../theme/ThemeProvider',()=>({useRovaTheme:()=>({theme:jest.requireActual('../theme/theme').resolveTheme('light','light')})}));
jest.mock('expo-router',()=>({router:{replace:jest.fn(),push:jest.fn()},usePathname:()=>'/navigation',useRootNavigationState:()=>({key:'test-root'})}));
jest.mock('../routing/runtime',()=>({routingProvider:{routes:jest.fn()}}));
jest.mock('expo-location',()=>({Accuracy:{BestForNavigation:6},getForegroundPermissionsAsync:jest.fn(),getCurrentPositionAsync:jest.fn()}));
const option:RoutingOption={id:'ISOLATED TEST ROUTE',label:'TEST',isSample:false,trafficAware:false,etaKind:'static_estimate',attribution:'TEST ONLY',geometry:{type:'LineString',coordinates:[[0,0],[.01,0]]},distanceMeters:1000,durationSeconds:300,tolls:'unknown',maneuvers:[{instruction:'TEST TURN',geometryIndex:1,distanceMeters:1000,durationSeconds:300}]};
beforeEach(async()=>{await clearJourneyCheckpoint();jest.clearAllMocks();Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});});
afterEach(async()=>{await clearJourneyCheckpoint();});
function Consumer(){const {route}=useRoutePreview();const s=useActiveNavigation(route?.destination??[.01,0],option,'private_car');return <Button title="End test journey" onPress={s.stop}/>;}
function Shell(){const [visible,setVisible]=useState(true);return <RouteProvider><ActiveNavigationProvider>{visible&&<Consumer/>}<Button title="Leave navigation screen" onPress={()=>setVisible(false)}/><Text>Other screen</Text></ActiveNavigationProvider></RouteProvider>;}
test('leaving the navigation screen does not stop the root-owned active journey',async()=>{
 const view=await render(<Shell/>);await waitFor(()=>expect(mockStart).toHaveBeenCalledTimes(1));
 await fireEvent.press(screen.getByRole('button',{name:'Leave navigation screen'}));expect(mockCleanup).not.toHaveBeenCalled();
 expect((await loadJourneyCheckpoint())?.destination).toEqual([.01,0]);await view.unmount();expect(mockCleanup).toHaveBeenCalledTimes(1);
});
test('End clears the recovery destination',async()=>{
 const view=await render(<Shell/>);await waitFor(()=>expect(mockStart).toHaveBeenCalledTimes(1));
 await fireEvent.press(screen.getByRole('button',{name:'End test journey'}));await waitFor(async()=>expect(await loadJourneyCheckpoint()).toBeNull());expect(mockStop).toHaveBeenCalled();await view.unmount();
});
test('a new root recovers only the destination, requests a fresh route, and restores the journey',async()=>{
 await saveJourneyCheckpoint([.01,0],'ISOLATED TEST DESTINATION','private_car');
 jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true} as Location.LocationPermissionResponse);
 jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({coords:{longitude:0,latitude:0}} as Location.LocationObject);
 jest.mocked(routingProvider.routes).mockResolvedValue({routes:[option],provider:'geoapify',attribution:'TEST'} as unknown as Awaited<ReturnType<typeof routingProvider.routes>>);
 function Observed(){const p=useRoutePreview();useEffect(()=>{if(p.route)expect(p.route.destinationLabel).toBe('ISOLATED TEST DESTINATION');},[p.route]);return null;}
 const view=await render(<RouteProvider><ActiveNavigationProvider><Observed/></ActiveNavigationProvider></RouteProvider>);
 await waitFor(()=>expect(mockStart).toHaveBeenCalledTimes(1));expect(routingProvider.routes).toHaveBeenCalledWith([0,0],[.01,0],expect.any(AbortSignal));await view.unmount();
});
test('recovery checkpoints expire and strip positions/routes/history rather than storing them',async()=>{
 const savedAt=Date.now();const parsed=validateJourneyCheckpoint({journey:{destination:[0,0],title:'TEST',vehicleType:'private_car',savedAt,expiresAt:savedAt+1000,rawRoute:[[1,1]],history:[[2,2]]}});
 expect(parsed.journey).not.toHaveProperty('rawRoute');expect(parsed.journey).not.toHaveProperty('history');
 await saveJourneyCheckpoint([0,0],'TEST','private_car');const clock=jest.spyOn(Date,'now').mockReturnValue(savedAt+6*3600000+1000);
 try{expect(await loadJourneyCheckpoint()).toBeNull();}finally{clock.mockRestore();}
});
test('End during route recovery prevents a late response from restarting navigation',async()=>{
 await saveJourneyCheckpoint([.01,0],'TEST','private_car');
 jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true} as Location.LocationPermissionResponse);
 jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({coords:{longitude:0,latitude:0}} as Location.LocationObject);
 let resolve!:(v:Awaited<ReturnType<typeof routingProvider.routes>>)=>void;
 jest.mocked(routingProvider.routes).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const view=await render(<RouteProvider><ActiveNavigationProvider><Text>TEST</Text></ActiveNavigationProvider></RouteProvider>);
 await waitFor(()=>expect(routingProvider.routes).toHaveBeenCalled());
 await act(async()=>eraseActiveJourney());await act(async()=>resolve({routes:[option]} as never));
 expect(mockStart).not.toHaveBeenCalled();expect(await loadJourneyCheckpoint()).toBeNull();await view.unmount();
});
