import {nativeReminderAdapter,notificationsAvailable,phonePermission} from '../notifications/native';
import {validatePreferences} from '../notifications/storage';
import {defaultNotificationPreferences} from '@rova/shared';
import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
let mockAvailable=true;const mockOrder:string[]=[];
let mockGranted=false,mockCanAsk=true;
jest.mock('expo-modules-core',()=>({requireOptionalNativeModule:()=>mockAvailable?{}:null}));
jest.mock('expo-file-system',()=>({File:class{},Paths:{document:'test://'}}));
jest.mock('expo-notifications',()=>({AndroidImportance:{LOW:2},AndroidNotificationVisibility:{PRIVATE:0},setNotificationChannelAsync:async()=>{mockOrder.push('channel');},getPermissionsAsync:async()=>{mockOrder.push('read');return{granted:mockGranted,canAskAgain:mockCanAsk};},requestPermissionsAsync:async()=>{mockOrder.push('prompt');return{granted:true,canAskAgain:true};}}));
test('Android channels precede explicit permission requests; startup, denial and older builds never prompt',async()=>{
 Object.defineProperty(Platform,'OS',{value:'android'});
 const load=async()=>Notifications;
 mockOrder.length=0;mockGranted=false;mockCanAsk=true;expect((await phonePermission(false,load)).granted).toBe(false);expect(mockOrder).toEqual(['channel','channel','read']);
 mockOrder.length=0;expect((await phonePermission(true,load)).granted).toBe(true);expect(mockOrder).toEqual(['channel','channel','read','prompt']);
 mockOrder.length=0;mockCanAsk=false;expect((await phonePermission(true,load)).granted).toBe(false);expect(mockOrder).not.toContain('prompt');
 mockAvailable=false;expect(notificationsAvailable()).toBe(false);await expect(nativeReminderAdapter.scheduled()).rejects.toThrow('updated ROVA');mockAvailable=true;
});
test('local preferences omit unknown sensitive fields and retain only coarse regions and renewal dates',()=>{
 const p=validatePreferences({...defaultNotificationPreferences,documentNumber:'never persist',history:[1,2],regions:[{id:'region:-0.2:5.62',label:'Home',lon:-.20123,lat:5.61234,rawRoute:[[1,2]]}],renewals:[{kind:'insurance',dueDate:'2026-12-31',policyNumber:'never persist'}]});
 expect(p.regions[0].lon).toBe(-.2);expect(p.regions[0].lat).toBe(5.62);expect(JSON.stringify(p)).not.toContain('never persist');expect(JSON.stringify(p)).not.toContain('rawRoute');
 expect(()=>validatePreferences({...p,renewals:[{kind:'insurance',dueDate:'2026-02-30'}]})).toThrow();
});
