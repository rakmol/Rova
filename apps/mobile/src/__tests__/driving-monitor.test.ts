import {AppState,type AppStateStatus} from 'react-native';
import * as Location from 'expo-location';
import {startDrivingMonitor} from '../safety/monitor';
import {navigationInteraction} from '../safety/driving';
jest.mock('expo-location',()=>({Accuracy:{Balanced:3},getForegroundPermissionsAsync:jest.fn(),watchPositionAsync:jest.fn(),requestForegroundPermissionsAsync:jest.fn()}));
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
test('movement guard uses granted foreground permission, stops in background and avoids a second watch during navigation',async()=>{
 jest.useFakeTimers();const remove=jest.fn();let state!:(s:AppStateStatus)=>void;
 Object.defineProperty(AppState,'currentState',{value:'active',configurable:true});jest.spyOn(AppState,'addEventListener').mockImplementation((_,handler)=>{state=handler;return{remove:jest.fn()};});
 jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true}as Location.LocationPermissionResponse);jest.mocked(Location.watchPositionAsync).mockResolvedValue({remove});
 const stop=startDrivingMonitor();await flush();expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);expect(jest.mocked(Location.watchPositionAsync).mock.calls[0][0]).toMatchObject({accuracy:3,timeInterval:3000});
 navigationInteraction(true);expect(remove).toHaveBeenCalledTimes(1);await flush();expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
 navigationInteraction(false);await flush();expect(Location.watchPositionAsync).toHaveBeenCalledTimes(2);state('background');expect(remove).toHaveBeenCalledTimes(2);
 state('active');await flush();expect(Location.watchPositionAsync).toHaveBeenCalledTimes(3);stop();expect(remove).toHaveBeenCalledTimes(3);jest.restoreAllMocks();jest.useRealTimers();
});
