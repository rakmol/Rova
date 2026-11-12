import {fireEvent,render,waitFor}from'@testing-library/react-native';
import {SavePlaceActions}from'../account/SavePlaceActions';
import SavedScreen from'../app/(tabs)/saved';
import {ThemeProvider}from'../theme/ThemeProvider';
import {clearLocalDriverData}from'../account/local';
const mockPick=jest.fn();const mockNavigate=jest.fn();const mockDisk={text:'',exists:false};
jest.mock('expo-router',()=>({router:{navigate:(...args:unknown[])=>mockNavigate(...args),push:jest.fn()}}));
jest.mock('../map/RouteProvider',()=>({useRoutePreview:()=>({setPickedDestination:mockPick})}));
jest.mock('expo-file-system',()=>({Paths:{document:'test://'},File:class{get exists(){return mockDisk.exists;}create(){mockDisk.exists=true;}textSync(){return mockDisk.text;}write(text:string){mockDisk.text=text;}}}));
test('a guest saves Home from a licensed result, selects it for navigation, and removes it without signing in',async()=>{
  await clearLocalDriverData();
  const place={id:'test-home',storageProof:'synthetic-test-receipt',name:'Test home',detail:'Test address',coordinate:[-.2,5.6]as[number,number],attribution:'Powered by Geoapify · test fixture'};
  const saver=await render(<ThemeProvider><SavePlaceActions place={place}/></ThemeProvider>);
  await fireEvent.press(saver.getByText('Save as Home'));await waitFor(()=>expect(saver.getByText('Saved on this phone.')).toBeTruthy());
  const saved=await render(<ThemeProvider><SavedScreen/></ThemeProvider>);
  try{
    expect(saved.getByText('HOME')).toBeTruthy();await fireEvent.press(saved.getByText('Navigate to Test home'));
    expect(mockPick).toHaveBeenCalledWith({name:'Test home',detail:'Test address',coordinate:[-.2,5.6]});expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/map');
    await fireEvent.press(saved.getByText('Remove Test home'));await waitFor(()=>expect(saved.getByText('Nothing saved yet')).toBeTruthy());
  }finally{await saved.unmount();await saver.unmount();}
});
