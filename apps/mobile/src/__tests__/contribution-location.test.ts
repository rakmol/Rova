import * as Location from 'expo-location';
import {reportPosition,isContributionPoint} from '../contributions/location';
jest.mock('expo-location',()=>({getForegroundPermissionsAsync:jest.fn(),requestForegroundPermissionsAsync:jest.fn(),hasServicesEnabledAsync:jest.fn(),getCurrentPositionAsync:jest.fn(),Accuracy:{High:4}}));
const fix=()=>({coords:{longitude:-.2,latitude:5.6,accuracy:8},timestamp:Date.now()}) as Location.LocationObject;
beforeEach(()=>{jest.clearAllMocks();jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:true} as never);jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true);jest.mocked(Location.getCurrentPositionAsync).mockImplementation(async()=>fix());});
test('existing permission avoids a repeated system prompt and GPS does not open Android settings activities',async()=>{
 await reportPosition();expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({accuracy:4,mayShowUserSettingsDialog:false});
});
test('first-time permission and disabled phone location return actionable errors',async()=>{
 jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({granted:false} as never);jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({granted:false} as never);
 await expect(reportPosition()).rejects.toThrow('permission is off');expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
 jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({granted:true} as never);jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false);
 await expect(reportPosition()).rejects.toThrow('Turn on Location');
});
test('invalid/stale/imprecise fixes and locations outside Ghana cannot replace an observed pin',async()=>{
 for(const patch of [{coords:{accuracy:null}},{coords:{accuracy:NaN}},{coords:{accuracy:0}},{coords:{accuracy:60}},{coords:{longitude:Infinity}},{coords:{latitude:2}},{timestamp:Date.now()-61000},{timestamp:Date.now()+10000}]){
  const base=fix();jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({...base,...patch,coords:{...base.coords,...patch.coords}} as Location.LocationObject);await expect(reportPosition()).rejects.toThrow();
 }
 expect(isContributionPoint([-.2,5.6])).toBe(true);expect(isContributionPoint([NaN,5.6])).toBe(false);
});
test('GPS timeout returns without waiting indefinitely',async()=>{
 jest.useFakeTimers();try{jest.mocked(Location.getCurrentPositionAsync).mockReturnValue(new Promise(()=>{}));const pending=expect(reportPosition()).rejects.toThrow('taking too long');await jest.advanceTimersByTimeAsync(12001);await pending;}finally{jest.useRealTimers();}
});
