import {headingDifference,projectOnPath,type ReportedSpeedLimit} from '@rova/shared';
import type {BoundComplianceContext} from './smart-alerts';
import type {Fix} from './session';

/** Display only. Never feed a report into the verified smart-alert engine. */
export function currentReportedSpeed(context:BoundComplianceContext|null,fix:Fix|null,now:number,active:boolean):ReportedSpeedLimit|null{
 const data=context?.data,report=data?.reportedSpeedLimit;
 if(!active||!data||!report||data.limit.status==='verified'||!fix||fix.heading===null||!Number.isFinite(fix.heading)||fix.accuracy===null||fix.accuracy<=0||fix.accuracy>20||now-fix.timestamp>3000||fix.timestamp>now+1000||fix.timestamp<data.fixTimestamp
  ||now-data.checkedAt>3000||data.checkedAt>now+1000||report.validUntil<=now||report.validUntil>data.checkedAt+3000||Date.parse(report.expiresAt)<=now||Date.parse(report.reportedAt)>now||headingDifference(fix.heading,context!.heading)>25)return null;
 const p=projectOnPath(fix.coordinate,report.geometry.coordinates);
 if(!p||p.ambiguous||p.distance>8||Math.min(headingDifference(p.heading,fix.heading),headingDifference((p.heading+180)%360,fix.heading))>25)return null;
 return report;
}
