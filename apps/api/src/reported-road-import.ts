import { createHash } from "node:crypto";
import type { Client } from "pg";
export const roadKey=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[.’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export interface RoadReport { id:string;area:string;city:'accra'|'kumasi';sourceUrl:string;publishedAt:string;sourceUpdatedAt:string|null }
export function roadAssociations(reports:RoadReport[],candidates:{id:string;name:string|null;coordinates:[number,number][]}[]) {
  const groups=new Map<string,{id:string;roadName:string;roadKey:string;city:RoadReport['city'];sourceUrl:string;reportedAt:string;reportIds:string[];candidateIds:string[]}>();
  const unmapped:string[]=[];
  for(const report of reports){
    const name=report.area.split(' / ')[0];
    // Broad suburb names and numbered national highways do not identify an alert boundary.
    if(!/\b(road|street|avenue|highway|lane|link|roundabout|interchange|junction)\b/i.test(name)||/\b(area|towards)\b/i.test(name)){unmapped.push(report.id);continue;}
    const key=roadKey(name);const links=candidates.filter(c=>c.name&&roadKey(c.name)===key&&c.coordinates.some(([lon,lat])=>report.city==='accra'?lon>=-.4&&lon<=.05&&lat>=5.45&&lat<=5.85:lon>=-1.85&&lon<=-1.3&&lat>=6.4&&lat<=6.9));
    if(!links.length){unmapped.push(report.id);continue;}
    const identity=`${report.city}:${key}`;const prior=groups.get(identity);const when=report.sourceUpdatedAt??report.publishedAt;
    if(prior){prior.reportIds.push(report.id);if(when>prior.reportedAt){prior.reportedAt=when;prior.sourceUrl=report.sourceUrl;}continue;}
    const digest=createHash('sha256').update(identity).digest('hex').slice(0,32);const id=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20)].join('-');
    groups.set(identity,{id,roadName:links[0].name!,roadKey:identity,city:report.city,sourceUrl:report.sourceUrl,reportedAt:when,reportIds:[report.id],candidateIds:links.map(c=>c.id)});
  }
  return {advisories:[...groups.values()],unmapped};
}
export async function importReportedRoads(client:Client,reports:RoadReport[],actor:string){
  await client.query('BEGIN');try{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rova.reported_roads')),set_config('rova.actor_id',$1,true)",[actor]);
    const rows=await client.query("SELECT DISTINCT ON(osm_way_id) id,road_name AS name,ST_AsGeoJSON(geometry)::jsonb AS geometry FROM map_road_candidates ORDER BY osm_way_id,osm_version DESC");
    const result=roadAssociations(reports,rows.rows.map(c=>({id:c.id,name:c.name,coordinates:c.geometry.coordinates})));
    for(const a of result.advisories){
      const expiry=new Date(Date.parse(a.reportedAt)+30*86400000).toISOString();
      await client.query("INSERT INTO reported_road_advisories(id,road_name,road_key,city,source_url,report_ids,reported_at,expires_at,imported_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET road_name=EXCLUDED.road_name,source_url=EXCLUDED.source_url,report_ids=EXCLUDED.report_ids,reported_at=EXCLUDED.reported_at,expires_at=EXCLUDED.expires_at,updated_at=now()",[a.id,a.roadName,a.roadKey,a.city,a.sourceUrl,JSON.stringify(a.reportIds),a.reportedAt,expiry,actor]);
      await client.query('DELETE FROM reported_road_advisory_segments WHERE advisory_id=$1',[a.id]);
      await client.query('INSERT INTO reported_road_advisory_segments(advisory_id,candidate_id) SELECT $1,x::uuid FROM jsonb_array_elements_text($2::jsonb) AS x',[a.id,JSON.stringify(a.candidateIds)]);
    }
    // A removed/unmapped association must not retain old geometry. Explicit operator disables stay disabled.
    await client.query('DELETE FROM reported_road_advisory_segments WHERE advisory_id<>ALL($1::uuid[])',[result.advisories.map(a=>a.id)]);
    await client.query('COMMIT');return result;
  }catch(e){await client.query('ROLLBACK');throw e;}
}
