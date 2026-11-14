import * as Location from 'expo-location';
import type {MapCoordinate} from '../map/types';

export function isContributionPoint(point:MapCoordinate){
 return point.every(Number.isFinite)&&point[0]>=-4&&point[0]<=2&&point[1]>=4&&point[1]<=12;
}
export async function reportPosition():Promise<Location.LocationObject>{
 const existing=await Location.getForegroundPermissionsAsync();
 const permission=existing.granted?existing:await Location.requestForegroundPermissionsAsync();
 if(!permission.granted)throw new Error('Location permission is off. You can select the observed point on the map instead.');
 if(!await Location.hasServicesEnabledAsync())throw new Error('Turn on Location in your phone settings, or select the observed point on the map.');
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const fix=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High,mayShowUserSettingsDialog:false}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Location is taking too long. Try outdoors or select the point on the map.')),12000);})]);
  const {accuracy,longitude,latitude}=fix.coords;
  if(accuracy===null||!Number.isFinite(accuracy)||accuracy<=0||accuracy>50)throw new Error('Location is imprecise. Try outdoors or choose the actual point on the map.');
  if(!Number.isFinite(fix.timestamp)||Date.now()-fix.timestamp>60000||fix.timestamp>Date.now()+5000)throw new Error('Location is outdated. Retry or choose the actual point on the map.');
  if(!isContributionPoint([longitude,latitude]))throw new Error('Choose an observed location in Ghana. Your existing pin has been kept.');
  return fix;
 }finally{clearTimeout(timer);}
}
