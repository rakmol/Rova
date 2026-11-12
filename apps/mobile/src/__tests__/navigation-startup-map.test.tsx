import { render, waitFor } from '@testing-library/react-native';
import { Text as MockText } from 'react-native';
import NavigationScreen from '../app/navigation';
import { ThemeProvider } from '../theme/ThemeProvider';
import { useRoutePreview } from '../map/RouteProvider';
import { useNavigationSession } from '../navigation/useNavigationSession';
const mockMap=jest.fn();
jest.mock('expo-router',()=>({router:{back:jest.fn()}}));
jest.mock('../map/RouteProvider',()=>({useRoutePreview:jest.fn()}));
jest.mock('../navigation/useNavigationSession',()=>({useNavigationSession:jest.fn()}));
jest.mock('../map/mapboxProvider',()=>({mapboxProvider:{initialize:async()=>{}}}));
jest.mock('../map/MapboxMap',()=>({MapboxMap:(props:unknown)=>{mockMap(props);return <MockText>Preview map mounted</MockText>;}}));
jest.mock('../navigation/SmartAlertPanel',()=>({SmartAlertPanel:()=>null}));
jest.mock('../navigation/NavigationInstruction',()=>({NavigationInstruction:()=>null}));
jest.mock('../incidents/NearbyHazards',()=>({HazardFeedView:()=>null}));

test('navigation paints the existing preview before GPS/session route is ready and keeps the location indicator off',async()=>{
  const geometry={type:'LineString' as const,coordinates:[[-.2,5.6],[-.19,5.61]] as [number,number][]};
  const preview={origin:[-.2,5.6],destination:[-.19,5.61],geometry,distanceMeters:1500,durationSeconds:300,originIsLive:true,destinationLabel:'Test destination'};
  jest.mocked(useRoutePreview).mockReturnValue({route:preview,selectedRoutingOption:null,vehicleType:'private_car'} as unknown as ReturnType<typeof useRoutePreview>);
  const session={snapshot:{state:'idle',route:null,progress:null,gpsReliable:false,message:'Preparing route and checking GPS',speedKmh:null},updatedAt:1000000,stop:jest.fn(),muted:false,congestionAlert:null};
  jest.mocked(useNavigationSession).mockReturnValue(session as unknown as ReturnType<typeof useNavigationSession>);
  const view=await render(<ThemeProvider><NavigationScreen/></ThemeProvider>);
  try{
    await waitFor(()=>expect(view.getByText('Preview map mounted')).toBeTruthy());
    expect(mockMap.mock.calls.at(-1)?.[0]).toMatchObject({routeGeometry:geometry,center:preview.origin,locationEnabled:false});
    expect(view.getByText('5 min')).toBeTruthy();
  }finally{await view.unmount();}
});
