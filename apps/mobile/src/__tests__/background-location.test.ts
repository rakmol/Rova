import * as Location from 'expo-location';
import * as Tasks from 'expo-task-manager';
import {startBackgroundNavigation,stopBackgroundNavigation} from '../navigation/background-location';
jest.mock('expo-modules-core',()=>({requireOptionalNativeModule:()=>({})}));
jest.mock('expo-task-manager',()=>({isTaskDefined:()=>false,defineTask:jest.fn()}));
jest.mock('expo-location',()=>({Accuracy:{BestForNavigation:6},getBackgroundPermissionsAsync:jest.fn(),hasStartedLocationUpdatesAsync:jest.fn(),startLocationUpdatesAsync:jest.fn(),stopLocationUpdatesAsync:jest.fn()}));
beforeEach(()=>{jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({granted:true} as Location.LocationPermissionResponse);jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(false);jest.mocked(Location.startLocationUpdatesAsync).mockClear();jest.mocked(Location.stopLocationUpdatesAsync).mockClear();});
test('denied background permission never starts a foreground service',async()=>{
 jest.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({granted:false} as Location.LocationPermissionResponse);
 expect(await startBackgroundNavigation(jest.fn())).toBeNull();expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
});
test('navigation gets fresh background fixes and stops the named service when the last consumer ends',async()=>{
 const received=jest.fn(),subscription=await startBackgroundNavigation(received);
 expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith('rova-active-navigation-location',expect.objectContaining({timeInterval:1000,distanceInterval:0,foregroundService:expect.objectContaining({notificationTitle:'ROVA navigation is active',killServiceOnDestroy:false})}));
 const callback=jest.mocked(Tasks.defineTask).mock.calls[0][1];
 const fresh={timestamp:Date.now(),coords:{latitude:0,longitude:0}},old={...fresh,timestamp:Date.now()-20000};
 await callback({data:{locations:[old,fresh]},error:null} as never);expect(received).toHaveBeenCalledTimes(1);expect(received).toHaveBeenCalledWith(fresh);
 jest.mocked(Location.hasStartedLocationUpdatesAsync).mockResolvedValue(true);subscription!.remove();await stopBackgroundNavigation();expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith('rova-active-navigation-location');
});
