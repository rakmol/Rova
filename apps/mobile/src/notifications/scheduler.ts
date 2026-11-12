import {planRenewals,type NotificationPreferences} from '@rova/shared';
export interface ReminderAdapter{permission(request:boolean):Promise<boolean>;scheduled():Promise<string[]>;cancel(id:string):Promise<void>;schedule(item:ReturnType<typeof planRenewals>[number]):Promise<void>}
export async function reconcileReminders(adapter:ReminderAdapter,p:NotificationPreferences,request=false,now=Date.now()){
 const existing=(await adapter.scheduled()).filter(id=>id.startsWith('rova.renewal.'));
 // Only an explicit user action can prompt for permission.
 const plan=p.enabled&&p.reminders?planRenewals(p,now):[];
 if(plan.length&&!await adapter.permission(request)){for(const id of existing)await adapter.cancel(id);throw new Error('Phone notifications are not allowed. Allow ROVA notifications in phone settings.');}
 const desired=new Set(plan.map(item=>item.id));
 try{for(const id of existing)if(!desired.has(id))await adapter.cancel(id);for(const item of plan)if(!existing.includes(item.id))await adapter.schedule(item);}
 catch{for(const id of new Set([...existing,...plan.map(item=>item.id)]))try{await adapter.cancel(id);}catch{}throw new Error('Reminders could not be scheduled. Check phone settings and try saving again.');}
 return plan.length;
}
