import type {ComplianceCoordinate, ReportedSpeedLimit} from '@rova/shared';
import {course,headingDifference,metres,projectOnPath} from './compliance-geometry.js';
import {reportedSpeedData} from './reported-speed-data.js';

// Join only identical mapped endpoints, never bridge gaps or nearby parallel roads.
// Short OSM way boundaries are mapping artifacts, not report boundaries.
export function joinReportedPieces(parts:ComplianceCoordinate[][]){
 const chains=parts.map(p=>p.map(c=>[...c] as ComplianceCoordinate));
 let changed=true;
 while(changed){changed=false;
  outer:for(let i=0;i<chains.length;i++)for(let j=i+1;j<chains.length;j++){
   const a=chains[i],b=chains[j];
   if(a.length+b.length>512)continue;
   for(const reverseA of [false,true])for(const reverseB of [false,true]){
    const x=reverseA?[...a].reverse():a,y=reverseB?[...b].reverse():b;
    if(metres(x.at(-1)!,y[0])>.25)continue;
    // Do not turn a crossing/fork into a connected advisory corridor.
    if(Math.abs(headingDifference(course(x.at(-2)!,x.at(-1)!),course(y[0],y[1])))>35)continue;
    chains[i]=[...x,...y.slice(1)];chains.splice(j,1);changed=true;break outer;
   }
  }
 }
 return chains;
}
const chains=joinReportedPieces(reportedSpeedData.parts.map(p=>p.coordinates.map(c=>[c[0],c[1]])));

/** Road geometry scopes an owner report, not the extent of an official restriction. */
export function reportedSpeedLimit(fix:{lon:number;lat:number;accuracy:number;heading?:number;timestamp:number},path:ComplianceCoordinate[],now:number,displayLifetimeMs=3000):ReportedSpeedLimit|null{
 const report=reportedSpeedData;
 if(now<Date.parse(report.reportedAt)||now>=Date.parse(report.expiresAt)||now-fix.timestamp>3000||fix.timestamp>now+1000||fix.accuracy<=0||fix.accuracy>20||fix.heading===undefined)return null;
 const point:ComplianceCoordinate=[fix.lon,fix.lat];
 const route=projectOnPath(point,path);
 if(!route||route.ambiguous||route.distance>8||headingDifference(route.heading,fix.heading)>25)return null;
 for(const coordinates of chains){
  const match=projectOnPath(point,coordinates);
  if(!match||match.ambiguous||match.distance>8||Math.min(headingDifference(match.heading,route.heading),headingDifference((match.heading+180)%360,route.heading))>20)continue;
  // Require traversal, rather than a road crossing or mere point proximity.
  const ahead:ComplianceCoordinate=[point[0]+Math.sin(route.heading*Math.PI/180)*30/(111195*Math.cos(point[1]*Math.PI/180)),point[1]+Math.cos(route.heading*Math.PI/180)*30/111195];
  const next=projectOnPath(ahead,coordinates);
  if(!next||next.ambiguous||next.distance>12||Math.abs(next.along-match.along)<15||headingDifference(course(point,ahead),route.heading)>5)continue;
  const length=coordinates.slice(1).reduce((n,p,i)=>n+metres(coordinates[i],p),0);
  if(Math.min(match.along,length-match.along)<fix.accuracy)continue;
  return {id:report.id,roadName:report.roadName,speedLimitKmh:report.speedLimitKmh,verification:'reported',reportedAt:report.reportedAt,expiresAt:report.expiresAt,sourceReference:report.sourceReference,sourceUrl:report.sourceUrl,validUntil:Math.min(now+Math.min(15000,displayLifetimeMs),Date.parse(report.expiresAt)),geometry:{type:'LineString',coordinates}};
 }
 return null;
}
