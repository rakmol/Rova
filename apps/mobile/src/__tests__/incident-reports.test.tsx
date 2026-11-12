import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import { IncidentReports } from '../incidents/IncidentReports';
import { ThemeProvider } from '../theme/ThemeProvider';
import { submitIncident,canInteract } from '../incidents/client';
jest.mock('expo-location',()=>({requestForegroundPermissionsAsync:jest.fn(),getCurrentPositionAsync:jest.fn(),Accuracy:{High:4}}));
jest.mock('../incidents/client',()=>({canInteract:jest.fn(()=>true),nearbyIncidents:jest.fn(async()=>[]),submitIncident:jest.fn(async()=>({duplicate:false})),voteIncident:jest.fn()}));
test('hazard submissions require safe mode, category tap and fresh GPS; denied location does not submit',async()=>{
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({status:'granted'});
  (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(async()=>({coords:{longitude:-.2,latitude:5.6,accuracy:10,speed:0},timestamp:Date.now()}));
  const v=await render(<ThemeProvider><IncidentReports/></ThemeProvider>);
  try{
    expect(v.queryByText('Pothole')).toBeNull();await fireEvent.press(v.getByText("I'm safely parked"));
    await fireEvent.press(v.getByText('Pothole'));await waitFor(()=>expect(submitIncident).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(v.getByText('Report submitted for review. Thank you.')).toBeTruthy());
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({status:'denied'});
    await fireEvent.press(v.getByText('Flooding'));await waitFor(()=>expect(v.getByText(/Allow location access/)).toBeTruthy());expect(submitIncident).toHaveBeenCalledTimes(1);
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({status:'granted'});(canInteract as jest.Mock).mockReturnValue(false);
    await fireEvent.press(v.getByText('Collision'));await waitFor(()=>expect(v.getByText(/Park safely first/)).toBeTruthy());expect(submitIncident).toHaveBeenCalledTimes(1);
  }finally{await v.unmount();}
},15000);
