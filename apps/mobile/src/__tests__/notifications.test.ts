import {accraAt,accraDay,pushWindow,planRenewals,defaultNotificationPreferences,validRenewalDate} from '@rova/shared';
import {reconcileReminders,type ReminderAdapter} from '../notifications/scheduler';
const p={...defaultNotificationPreferences,enabled:true,reminders:true,renewals:[{kind:'insurance' as const,dueDate:'2026-12-20'},{kind:'roadworthiness' as const,dueDate:'2026-12-20'}]};
test('Accra reminders use absolute Ghana time, validate dates, deduplicate and obey frequency caps',()=>{
 const old=process.env.TZ;try{for(const tz of ['America/New_York','Asia/Tokyo','Africa/Accra']){process.env.TZ=tz;expect(new Date(accraAt('2026-12-20')).toISOString()).toBe('2026-12-20T09:00:00.000Z');expect(accraDay(Date.parse('2026-12-20T00:01:00Z'))).toBe('2026-12-20');}}finally{process.env.TZ=old;}
 expect(validRenewalDate('2028-02-29')).toBe(true);expect(validRenewalDate('2027-02-29')).toBe(false);expect(validRenewalDate('2026-13-01')).toBe(false);
 const items=planRenewals(p,Date.parse('2026-12-01T00:00:00Z'));expect(items).toHaveLength(6);expect(new Set(items.map(i=>i.id)).size).toBe(6);expect(items.every(i=>new Date(i.at).getUTCHours()===9)).toBe(true);
 expect(planRenewals({...p,renewals:[...p.renewals,...p.renewals]},Date.parse('2026-12-01T00:00:00Z'))).toHaveLength(6);
 expect(planRenewals(p,Date.parse('2026-12-20T09:01:00Z'))).toEqual([]);expect(planRenewals({...p,enabled:false})).toEqual([]);
 expect(new Date(pushWindow(Date.parse('2026-12-20T22:00:00Z'))).toISOString()).toBe('2026-12-21T08:00:00.000Z');expect(pushWindow(Date.parse('2026-12-20T09:00:00Z'))).toBe(Date.parse('2026-12-20T09:00:00Z'));
});
test('permission denial, opt-out and partial scheduling never leave a false enabled schedule',async()=>{
 const ids=new Set(['other.feature','rova.renewal.old']),requests:boolean[]=[];let allow=false,fail=false;
 const a:ReminderAdapter={permission:async request=>{requests.push(request);return allow;},scheduled:async()=>[...ids],cancel:async id=>{ids.delete(id);},schedule:async item=>{if(fail)throw new Error('OS failure');ids.add(item.id);}};
 const now=Date.parse('2026-12-01T00:00:00Z');await expect(reconcileReminders(a,p,false,now)).rejects.toThrow('not allowed');expect(requests).toEqual([false]);expect([...ids]).toEqual(['other.feature']);
 allow=true;expect(await reconcileReminders(a,p,true,now)).toBe(6);expect(ids.size).toBe(7);await reconcileReminders(a,{...p,enabled:false},false,now);expect([...ids]).toEqual(['other.feature']);
 fail=true;await expect(reconcileReminders(a,p,true,now)).rejects.toThrow('could not be scheduled');expect([...ids]).toEqual(['other.feature']);
});
