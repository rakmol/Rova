import {tx} from "../i18n";
import type{ReportedRoadNotice}from'@rova/shared';
import{headingDifference,metres}from'@rova/shared';
import type{Fix}from'./session';
import type{BoundComplianceContext}from'./smart-alerts';
export const reportedRoadAlertsEnabled=process.env.EXPO_PUBLIC_REPORTED_ROAD_ALERTS_ENABLED!=="false";
export interface ReportedRoadAlertSnapshot{nearby:ReportedRoadNotice|null;alert:{id:string;text:string}|null}
export const emptyReportedRoadAlert=():ReportedRoadAlertSnapshot=>({nearby:null,alert:null});
export class ReportedRoadAlertEngine{
  private seen=new Set<string>();private pending=new Map<string,{timestamp:number;count:number}>();private lastAlert=-Infinity;
  update(input:{context:BoundComplianceContext|null;fix:Fix|null;progressMeters:number;reliable:boolean;navigating:boolean;enabled:boolean;now:number;suppressPrompt?:boolean}):ReportedRoadAlertSnapshot{
    const result=emptyReportedRoadAlert();const{context,fix,now}=input;const data=context?.data;const reports=data?.reportedRoads;
    const delta=context?input.progressMeters-context.progressMeters:Infinity;
    if(!input.enabled||!input.navigating||!input.reliable||!fix||fix.accuracy===null||!Number.isFinite(fix.accuracy)||fix.accuracy<=0||fix.accuracy>25||!Number.isFinite(fix.timestamp)||!fix.coordinate.every(Number.isFinite)||fix.heading===null||!Number.isFinite(fix.heading)||fix.heading<0||fix.heading>=360
      ||now-fix.timestamp>3000||fix.timestamp>now+1000||!data||!reports||reports.status!=='available'||reports.validUntil<=now||reports.validUntil>data.checkedAt+5000
      ||now-data.checkedAt>5000||data.checkedAt>now+1000||fix.timestamp<data.fixTimestamp||now-data.fixTimestamp>6000
      ||delta< -3||delta>100||metres(fix.coordinate,data.coordinate)>100||headingDifference(fix.heading,context!.heading)>30){this.pending.clear();return result;}
    const eligible=reports.notices.filter(n=>n.verification==='unverified'&&n.scope==='named_road_not_camera'&&n.distanceMeters-delta<=400&&n.exitDistanceMeters-delta>=-10)
      .map(n=>({...n,distanceMeters:Math.max(0,n.distanceMeters-delta),exitDistanceMeters:n.exitDistanceMeters-delta})).sort((a,b)=>a.distanceMeters-b.distanceMeters);
    result.nearby=eligible[0]??null;
    const active=new Set(eligible.map(n=>n.id));for(const id of this.pending.keys())if(!active.has(id))this.pending.delete(id);
    for(const n of eligible){
      if(this.seen.has(n.id))continue;let count=this.pending.get(n.id);
      if(!count||fix.timestamp-count.timestamp>3000)count={timestamp:fix.timestamp,count:1};
      else if(fix.timestamp>count.timestamp)count={timestamp:fix.timestamp,count:count.count+1};
      this.pending.set(n.id,count);
      if(count.count<2||input.suppressPrompt||now-this.lastAlert<60000)continue;
      this.seen.add(n.id);this.lastAlert=now;
      result.alert={id:n.id,text:n.distanceMeters>30?tx('voice.reportAhead'):tx('voice.reportHere')};
      break;
    }
    if(this.seen.size>256)this.seen.delete(this.seen.values().next().value!);
    return result;
  }
}
