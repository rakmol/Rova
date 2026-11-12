import {clearLocalDriverData} from '../account/local';
import {writeHistory} from '../places/history';
import {clearOfflineData} from '../offline/data';
import {eraseNotifications} from '../notifications/runtime';
import {placesProvider} from '../places/runtime';
import {independentCleanup} from './cleanup';
import {erasePilotData} from '../pilot/runtime';
export async function erasePhoneData(resetRoute:()=>void=()=>{}){
 const result=await independentCleanup([{name:'saved places/preferences',run:clearLocalDriverData},{name:'search history',run:()=>writeHistory({enabled:false,queries:[]})},{name:'offline downloads',run:clearOfflineData},{name:'search cache',run:()=>placesProvider.clearCache()},{name:'route preview',run:resetRoute},{name:'pilot diagnostics (remote erase may be queued)',run:erasePilotData},{name:'notification schedules/registration',run:eraseNotifications}]);
 if(!result.complete)throw new Error('Other cleanup steps completed. Retry these unfinished items: '+result.failures.join(', ')+'. Online notification deletion may remain queued.');
}
