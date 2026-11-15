import {fireEvent,render,screen} from '@testing-library/react-native';
import {VehicleSelector} from '../components/VehicleSelector';
import {OfficialSpeedGuide} from '../components/OfficialSpeedGuide';
jest.mock('../theme/ThemeProvider',()=>({useRovaTheme:()=>({theme:jest.requireActual('../theme/theme').resolveTheme('light','light')})}));
test('vehicle choices distinguish load and paid-passenger use and keep legacy uncertainty visible',async()=>{
 const change=jest.fn();const view=await render(<VehicleSelector value="heavy_vehicle" onChange={change}/>);
 expect(screen.getByRole('alert')).toBeTruthy();
 await fireEvent.press(screen.getByRole('radio',{name:'Heavy goods — loaded'}));expect(change).toHaveBeenLastCalledWith('loaded_heavy_vehicle');
 await fireEvent.press(screen.getByRole('radio',{name:'Heavy goods — unloaded'}));expect(change).toHaveBeenLastCalledWith('unloaded_heavy_vehicle');
 await fireEvent.press(screen.getByRole('radio',{name:'Passenger service — for reward'}));expect(change).toHaveBeenLastCalledWith('passenger_for_reward');
 await view.rerender(<VehicleSelector value="taxi" onChange={change}/>);expect(screen.getByText(/Vehicle maximum: 80 km\/h/)).toBeTruthy();
});
test('the reference clearly separates national rules from current-location limits',async()=>{
 await render(<OfficialSpeedGuide/>);expect(screen.getByText(/Unknown road categories remain unavailable/)).toBeTruthy();expect(screen.getByRole('button',{name:'Ghana Police speed guidance'})).toBeTruthy();
});
