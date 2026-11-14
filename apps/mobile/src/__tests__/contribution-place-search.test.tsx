import {useState} from 'react';
import {act,fireEvent,render,waitFor} from '@testing-library/react-native';
import {ContributionPlaceSearch} from '../contributions/ContributionPlaceSearch';
import {ThemeProvider} from '../theme/ThemeProvider';
import {placesProvider} from '../places/runtime';
import type {Place} from '../places/provider';
jest.mock('../places/runtime',()=>({placesProvider:{autocomplete:jest.fn()}}));
const place:Place={id:'test-only-area',name:'TEST ONLY Legon area',detail:'Synthetic autocomplete fixture',coordinate:[-.18,5.65],attribution:'Geoapify | OpenStreetMap contributors'};
function Search({onSelect=()=>{}}:{onSelect?:(p:Place)=>void}){const [value,setValue]=useState('');return <ThemeProvider><ContributionPlaceSearch value={value} onChange={setValue} onSelect={onSelect} disabled={false} bias={[-.2,5.6]} maxHeight={140} onFocus={()=>{}} onBlur={()=>{}}/></ThemeProvider>;}
beforeEach(()=>{jest.clearAllMocks();jest.mocked(placesProvider.autocomplete).mockResolvedValue([place]);});

test('contribution name offers real-provider suggestions, attribution and a tappable list above the keyboard',async()=>{
 const select=jest.fn(),view=await render(<Search onSelect={select}/>);
 try{
  await fireEvent(view.getByLabelText('Contribution name'),'focus');await fireEvent.changeText(view.getByLabelText('Contribution name'),'Legon');
  const result=await view.findByRole('button',{name:'Use area TEST ONLY Legon area'},{timeout:5000});
  expect(placesProvider.autocomplete).toHaveBeenCalledWith('Legon',[-.2,5.6],expect.any(AbortSignal));
  const list=view.getByTestId('contribution-place-suggestions');expect(list.props.keyboardShouldPersistTaps).toBe('always');expect(list.props.keyboardDismissMode).toBe('none');expect(list.props.style.maxHeight).toBe(140);
  expect(view.getByText(place.attribution)).toBeTruthy();await fireEvent.press(result);expect(select).toHaveBeenCalledWith(place);
  expect(view.queryByTestId('contribution-place-suggestions')).toBeNull();
 }finally{await view.unmount();}
});
test('an unavailable provider can retry; an empty result never fabricates a place or discards the observed name',async()=>{
 jest.mocked(placesProvider.autocomplete).mockRejectedValueOnce(new Error('Search temporarily unavailable')).mockResolvedValueOnce([]);
 const view=await render(<Search/>);
 try{
  const input=view.getByLabelText('Contribution name');await fireEvent(input,'focus');await fireEvent.changeText(input,'Unlisted observation');
  await view.findByText('Search temporarily unavailable',{}, {timeout:5000});expect(view.getByLabelText('Contribution name').props.value).toBe('Unlisted observation');
  await fireEvent.press(view.getByRole('button',{name:'Retry location suggestions'}));
  await view.findByText(/No suggestions found/,{}, {timeout:5000});expect(view.queryByRole('button',{name:/Use area/})).toBeNull();
 }finally{await view.unmount();}
});
test('debouncing cancels superseded queries and ignores late results',async()=>{
 jest.useFakeTimers();let resolve!:(p:Place[])=>void;jest.mocked(placesProvider.autocomplete).mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValueOnce([]);
 const view=await render(<Search/>);
 try{
  await fireEvent(view.getByLabelText('Contribution name'),'focus');await fireEvent.changeText(view.getByLabelText('Contribution name'),'Le');
  await act(async()=>{await jest.advanceTimersByTimeAsync(199);});expect(placesProvider.autocomplete).not.toHaveBeenCalled();
  await act(async()=>{await jest.advanceTimersByTimeAsync(1);});const signal=jest.mocked(placesProvider.autocomplete).mock.calls[0][2]!;
  await fireEvent.changeText(view.getByLabelText('Contribution name'),'Legon');expect(signal.aborted).toBe(true);
  await act(()=>resolve([place]));expect(view.queryByRole('button',{name:/Use area/})).toBeNull();
  await act(async()=>{await jest.advanceTimersByTimeAsync(200);});await waitFor(()=>expect(placesProvider.autocomplete).toHaveBeenCalledTimes(2));
 }finally{await view.unmount();jest.useRealTimers();}
});
