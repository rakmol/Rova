import {render,fireEvent} from '@testing-library/react-native';
import {Keyboard,Text,TextInput} from 'react-native';
import {DrivingGate} from '../safety/DrivingGate';
import {ThemeProvider} from '../theme/ThemeProvider';
import {acknowledgePassenger} from '../safety/driving';
const mockState={locked:true,passenger:false,navigation:true};
jest.mock('../safety/driving',()=>({useDrivingSafety:()=>mockState,acknowledgePassenger:jest.fn(),resetPassenger:jest.fn()}));
test('moving driver cannot see or focus a form; only explicit passenger acknowledgement or safe stop restores it',async()=>{
 const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
 const content=()=> <DrivingGate><Text>Test form</Text><TextInput accessibilityLabel="Unsafe typing fixture"/></DrivingGate>;
 const view=await render(<ThemeProvider>{content()}</ThemeProvider>);
 expect(view.queryByLabelText('Unsafe typing fixture')).toBeNull();expect(dismiss).toHaveBeenCalled();await fireEvent.press(view.getByRole('button',{name:"I'm a passenger"}));expect(acknowledgePassenger).toHaveBeenCalledTimes(1);
 mockState.passenger=true;await view.rerender(<ThemeProvider>{content()}</ThemeProvider>);expect(view.getByLabelText('Unsafe typing fixture')).toBeTruthy();expect(view.getByRole('button',{name:'Return to driver mode'})).toBeTruthy();
 mockState.passenger=false;mockState.locked=false;await view.rerender(<ThemeProvider>{content()}</ThemeProvider>);expect(view.getByText('Test form')).toBeTruthy();await view.unmount();dismiss.mockRestore();
});
