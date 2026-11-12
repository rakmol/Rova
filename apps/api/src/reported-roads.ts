import type {Pool}from'pg';
import type{ComplianceCoordinate,ReportedRoadContext,ReportedRoadNotice}from'@rova/shared';
import{course,headingDifference,metres,projectOnPath}from'./compliance-geometry.js';
export interface ReportedRoadCandidate {id:string;roadName:string;sourceUrl:string;reportedAt:string;geometry:{coordinates:ComplianceCoordinate[]}}
function routeSamples(path:ComplianceCoordinate[],start:number){
  const samples:{coordinate:ComplianceCoordinate;heading:number;distance:number}[]=[];let cumulative=0;let next=start;
  for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],length=metres(a,b);if(length<.1)continue;
    const end=cumulative+length;
    while(next<=end&&next-start<=550){if(next>=cumulative){const t=(next-cumulative)/length;samples.push({coordinate:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],heading:course(a,b),distance:next-start});}next+=10;}
    cumulative=end;if(next-start>550)break;
  }return samples;
}
/** Match traversal of a named road, not straight-line proximity to a camera. */
export function reportedRoadNotices(candidates:ReportedRoadCandidate[],path:ComplianceCoordinate[],position:number):ReportedRoadNotice[]{
  if(candidates.length>=257)return [];
  const samples=routeSamples(path,position);const groups=new Map<string,ReportedRoadCandidate[]>();
  for(const c of candidates){if(!c.geometry?.coordinates?.length||!c.id||!c.roadName)continue;const group=groups.get(c.id)??[];group.push(c);groups.set(c.id,group);}
  const notices:ReportedRoadNotice[]=[];
  for(const parts of groups.values()){
    let run:number|null=null,end=0;
    for(const sample of samples){
      const follows=parts.some(part=>{const p=projectOnPath(sample.coordinate,part.geometry.coordinates);return p&&!p.ambiguous&&p.distance<=8&&Math.min(headingDifference(sample.heading,p.heading),headingDifference(sample.heading,(p.heading+180)%360))<=30;});
      if(follows){run??=sample.distance;end=sample.distance;}
      else{if(run!==null&&end-run>=40)break;run=null;}
    }
    if(run===null||end-run<40||run>500)continue;
    const c=parts[0];notices.push({id:c.id,roadName:c.roadName,verification:'unverified',scope:'named_road_not_camera',distanceMeters:run,exitDistanceMeters:end,sourceUrl:c.sourceUrl,reportedAt:c.reportedAt});
  }
  return notices.sort((a,b)=>a.distanceMeters-b.distanceMeters||a.id.localeCompare(b.id)).slice(0,8);
}
export async function reportedRoadContext(database:Pool,fix:{lon:number;lat:number},path:ComplianceCoordinate[],position:number,now:number,enabled:boolean):Promise<ReportedRoadContext>{
  if(!enabled)return{status:'disabled',validUntil:now,notices:[]};
  try{const rows=await database.query<{candidate:ReportedRoadCandidate}>("SELECT candidate FROM public.rova_reported_road_candidates($1,$2) AS roads(candidate)",[fix.lon,fix.lat]);
    return{status:'available',validUntil:now+5000,notices:reportedRoadNotices(rows.rows.map(r=>r.candidate),path,position)};
  }catch{return{status:'unavailable',validUntil:now,notices:[]};}
}
