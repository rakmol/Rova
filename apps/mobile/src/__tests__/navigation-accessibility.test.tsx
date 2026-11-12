import {render} from '@testing-library/react-native';
import * as Native from 'react-native';
import NavigationScreen from '../app/navigation';
import {ThemeProvider} from '../theme/ThemeProvider';
import {useRoutePreview} from '../map/RouteProvider';
import {useNavigationSession} from '../navigation/useNavigationSession';
const mockMap=jest.fn();
jest.mock('expo-router',()=>({router:{back:jest.fn()}}));
jest.mock('../map/RouteProvider',()=>({useRoutePreview:jest.fn()}));
jest.mock('../navigation/useNavigationSession',()=>({useNavigationSession:jest.fn()}));
jest.mock('../map/mapboxProvider',()=>({mapboxProvider:{initialize:async()=>{}}}));
jest.mock('../map/MapboxMap',()=>({MapboxMap:(props:unknown)=>{mockMap(props);return null;}}));
jest.mock('../incidents/NearbyHazards',()=>({HazardFeedView:()=>null}));
const geometry={type:'LineString',coordinates:[[-.2,5.6],[-.19,5.61]]};
const route={origin:[-.2,5.6],destination:[-.19,5.61],geometry,distanceMeters:1500,durationSeconds:300,originIsLive:true,destinationLabel:'ISOLATED TEST DESTINATION'};
test('200% text on a small viewport keeps primary controls before the map, readable alerts, full maneuver text and no ads/forms',async()=>{
 const size=jest.spyOn(Native,'useWindowDimensions').mockReturnValue({width:360,height:640,scale:2,fontScale:2});
 jest.mocked(useRoutePreview).mockReturnValue({route,selectedRoutingOption:null,vehicleType:'private_car'}as unknown as ReturnType<typeof useRoutePreview>);
 const session={snapshot:{state:'navigating',route:null,gpsReliable:true,speedKmh:58,message:'Following test route',progress:{instruction:'Turn left at the test junction',turnMeters:80,remainingMeters:1500,remainingSeconds:300,coordinate:[-.2,5.6]}},updatedAt:Date.now(),stop:jest.fn(),muted:false,toggleMuted:jest.fn(),alertAudio:true,toggleAlertAudio:jest.fn(),smartAlerts:{state:'overspeed',limitKmh:50,enforcementStatus:'unavailable/unverified',upcoming:null,alert:null},congestionAlert:null,voiceError:null};
 jest.mocked(useNavigationSession).mockReturnValue(session as unknown as ReturnType<typeof useNavigationSession>);
 const view=await render(<ThemeProvider><NavigationScreen/></ThemeProvider>);
 try{
  const instruction=view.getByRole('header',{name:'Turn left at the test junction'});expect(instruction.props.numberOfLines).toBeUndefined();expect(Native.StyleSheet.flatten(instruction.props.style).fontSize).toBe(28);expect(instruction.props.allowFontScaling).not.toBe(false);
  expect(view.getByRole('alert',{name:/OVER SPEED LIMIT/})).toBeTruthy();expect(view.getByText('Verified limit: 50 km/h')).toBeTruthy();
  const controls=view.getAllByRole('button');expect(controls.slice(0,2).map(c=>c.props.accessibilityLabel)).toEqual(['Mute voice','End']);expect(Native.StyleSheet.flatten(controls[0].props.style).minHeight).toBeGreaterThanOrEqual(48);
  expect(view.getByTestId('navigation-accessible-content').props.scrollEnabled).toBe(true);expect(view.queryByText(/sponsored|advertisement/i)).toBeNull();
 }finally{await view.unmount();size.mockRestore();}
});
