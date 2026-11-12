export const NOTIFICATION_TIME_ZONE='Africa/Accra' as const;
export type RenewalKind='insurance'|'roadworthiness';
export type RenewalReminder={kind:RenewalKind;dueDate:string};
export type SavedNotificationRegion={id:string;label:string;lon:number;lat:number};
export type NotificationPreferences={enabled:boolean;closures:boolean;policy:boolean;reminders:boolean;marketing:false;currentTrip:false;timeZone:typeof NOTIFICATION_TIME_ZONE;dailyCap:1|2;regions:SavedNotificationRegion[];renewals:RenewalReminder[]};
export const defaultNotificationPreferences:NotificationPreferences={enabled:false,closures:false,policy:false,reminders:false,marketing:false,currentTrip:false,timeZone:NOTIFICATION_TIME_ZONE,dailyCap:2,regions:[],renewals:[]};
export function validRenewalDate(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&Number(value.slice(0,4))>=2026&&Number(value.slice(0,4))<=2100;}
export function accraDay(timestamp:number){const p=new Intl.DateTimeFormat('en-GB',{timeZone:NOTIFICATION_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp);return['year','month','day'].map(k=>p.find(v=>v.type===k)!.value).join('-');}
export function accraAt(date:string,hour=9){
 if(!validRenewalDate(date)||!Number.isInteger(hour)||hour<0||hour>23)throw new Error('Enter a valid date as YYYY-MM-DD.');
 const desired=Date.parse(date+`T${String(hour).padStart(2,'0')}:00:00Z`);let guess=desired;
 const format=new Intl.DateTimeFormat('en-GB',{timeZone:NOTIFICATION_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++){const p=format.formatToParts(guess),get=(k:string)=>p.find(v=>v.type===k)!.value;const displayed=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);guess+=desired-displayed;}
 return guess;
}
export function pushWindow(now:number){const today=accraDay(now),start=accraAt(today,8),end=accraAt(today,21);if(now<start)return start;if(now>=end)return accraAt(new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10),8);return now;}
export function planRenewals(p:NotificationPreferences,now=Date.now()){
 if(!p.enabled||!p.reminders)return[];
 const candidates:{id:string;kind:RenewalKind;at:number;daysBefore:number}[]=[];
 for(const r of p.renewals){if(!validRenewalDate(r.dueDate))throw new Error('Invalid renewal date.');for(const before of [7,1,0]){const day=new Date(Date.parse(r.dueDate+'T12:00:00Z')-before*86400000).toISOString().slice(0,10),at=day<accraDay(now)?0:accraAt(day);if(at>now)candidates.push({id:`rova.renewal.${r.kind}.${r.dueDate}.${before}`,kind:r.kind,at,daysBefore:before});}}
 const result:typeof candidates=[];const seen=new Set<string>();
 for(const c of candidates.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){if(seen.has(c.id))continue;seen.add(c.id);if(result.filter(v=>accraDay(v.at)===accraDay(c.at)).length>=2||result.filter(v=>v.at>c.at-7*86400000).length>=6)continue;result.push(c);}
 return result.slice(0,32);
}
