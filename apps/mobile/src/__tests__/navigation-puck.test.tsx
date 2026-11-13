import { act, render } from '@testing-library/react-native';
import { NavigationLocationPuck, NavigationMarkerImages } from '../map/NavigationLocationPuck';
import type { MotionReading } from '../map/locationMotion';
const mockPuck=jest.fn();const mockImages=jest.fn();const mockAdd=jest.fn();const mockRemove=jest.fn();
jest.mock('@rnmapbox/maps',()=>({__esModule:true,default:{locationManager:{addListener:(...args:unknown[])=>mockAdd(...args),removeListener:(...args:unknown[])=>mockRemove(...args)}},LocationPuck:(props:unknown)=>{mockPuck(props);return null;},Images:(props:unknown)=>{mockImages(props);return null;}}));

test('navigation reuses each supplied GPS fix instead of starting a second location stream',async()=>{
  mockAdd.mockClear();
  const view=await render(<NavigationLocationPuck fix={{coordinate:[-.2,5.6],accuracy:8,speed:4,heading:90,timestamp:Date.now()}}/>);
  expect(mockAdd).not.toHaveBeenCalled();
  expect(mockPuck.mock.calls.at(-1)?.[0]).toMatchObject({bearingImage:'rova-navigation-moving',puckBearingEnabled:true});
  await view.rerender(<NavigationLocationPuck fix={{coordinate:[-.1999,5.6],accuracy:8,speed:0,heading:90,timestamp:Date.now()}}/>);
  expect(mockPuck.mock.calls.at(-1)?.[0]).toMatchObject({topImage:'rova-navigation-stationary'});
  await view.unmount();
});
test('location marker stays an arrow at startup/stopped and rotates using supported bearing settings',async()=>{
  const images=await render(<NavigationMarkerImages/>);
  const view=await render(<NavigationLocationPuck/>);
  try{
    expect(Object.keys(mockImages.mock.calls.at(-1)?.[0].images)).toContain('rova-navigation-moving');
    expect(mockPuck.mock.calls.at(-1)?.[0]).toMatchObject({topImage:'rova-navigation-unknown',puckBearingEnabled:false});
    expect(mockPuck.mock.calls.at(-1)?.[0]).not.toHaveProperty('androidRenderMode');
    const update=mockAdd.mock.calls[0][0] as (reading:MotionReading)=>void;
    await act(()=>update({timestamp:Date.now(),coords:{accuracy:8,speed:0,course:90}}));
    expect(mockPuck.mock.calls.at(-1)?.[0]).toMatchObject({topImage:'rova-navigation-stationary',bearingImage:'rova-navigation-clear',puckBearingEnabled:false});
    await act(()=>update({timestamp:Date.now(),coords:{accuracy:8,speed:4,course:90}}));
    expect(mockPuck.mock.calls.at(-1)?.[0]).toMatchObject({topImage:'rova-navigation-clear',bearingImage:'rova-navigation-moving',puckBearingEnabled:true});
  }finally{await view.unmount();await images.unmount();}
  expect(mockRemove).toHaveBeenCalledWith(mockAdd.mock.calls[0][0]);
});
