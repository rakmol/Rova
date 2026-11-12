import { act, render, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { NearbyHazards } from '../incidents/NearbyHazards';
import { hazardTransport } from '../incidents/stream';
import { ThemeProvider } from '../theme/ThemeProvider';
jest.mock('../incidents/stream',()=>({hazardTransport:jest.fn()}));

test('hazard screen avoids region-corner reconnects, immediately aborts background activity, and resumes cleanly',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(AppState,'currentState');
  Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});
  let listener:((s:AppStateStatus)=>void)|undefined;
  const removed=jest.fn();const events=jest.spyOn(AppState,'addEventListener').mockImplementation((_event,cb)=>{listener=cb;return{remove:removed};});
  const aborted=jest.fn();
  jest.mocked(hazardTransport).mockImplementation((lon,lat)=>({
    stream:(signal)=>new Promise(resolve=>signal.addEventListener('abort',()=>{aborted();resolve();})),
    refresh:async()=>({type:'snapshot',region:{lon,lat,radiusMeters:4000},checkedAt:new Date().toISOString(),reports:[],truncated:false,traffic:{status:'unavailable',measurements:false}}),
  }));
  const v=await render(<ThemeProvider><NearbyHazards coordinate={[-.1901,5.6099]}/></ThemeProvider>);
  try{
    await waitFor(()=>expect(hazardTransport).toHaveBeenCalledTimes(1));
    await v.rerender(<ThemeProvider><NearbyHazards coordinate={[-.1899,5.6101]}/></ThemeProvider>);
    expect(hazardTransport).toHaveBeenCalledTimes(1);
    await act(()=>{listener?.('background');});expect(aborted).toHaveBeenCalledTimes(1);
    await act(()=>{listener?.('active');});await waitFor(()=>expect(hazardTransport).toHaveBeenCalledTimes(2));
  }finally{await v.unmount();events.mockRestore();if(descriptor)Object.defineProperty(AppState,'currentState',descriptor);}
  expect(aborted).toHaveBeenCalledTimes(2);expect(removed).toHaveBeenCalledTimes(1);
},15000);
