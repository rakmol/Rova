import { createHash } from "node:crypto";
import { z } from "zod";
import type { Client } from "pg";
const point = z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const featureSchema = z.object({ type: z.literal("Feature"), id: z.string().regex(/^w[1-9]\d*$/), geometry: z.object({type:z.literal("LineString"),coordinates:z.array(point).min(2).max(20000)}), properties: z.record(z.string(),z.unknown()) });
const collectionSchema = z.object({type:z.literal("FeatureCollection"),features:z.array(z.unknown()).max(50000)});
const roadClasses = new Set(["motorway","trunk","primary","secondary","tertiary","unclassified","residential","living_street","service","motorway_link","trunk_link","primary_link","secondary_link","tertiary_link"]);
const classes: Record<string,string> = { motorcar:"private_car",motorcycle:"motorcycle",bus:"bus",hgv:"heavy_vehicle" };
export interface OsmRoadCandidate {
  osmWayId: string; osmVersion: number; osmEditedAt: string; name: string | null; roadClass: string;
  geometry: { type:"LineString"; coordinates:[number,number][] }; tags: Record<string,string>;
  rules: { direction:"both"|"forward"|"reverse"; vehicleClass:string; speedLimitKmh:number; originalTag:string; originalValue:string }[];
  issues:string[]; fingerprint:string; sourceUrl:string;
}
export const hash = (value:string) => createHash("sha256").update(value).digest("hex");
/** Only explicit integer km/h values. No guessing defaults, mph conversion or conditional/lane parsing. */
export function explicitKmh(value:string) {
  const match=/^(\d{1,3})(?:\s*(?:km\/h|kmh|kph))?$/.exec(value.trim());
  const number=match?Number(match[1]):NaN;
  return Number.isInteger(number)&&number>=1&&number<=200?number:null;
}
export function prepareOsmRoads(input:unknown, snapshotAt:string, now=Date.now(),options:{includeNamedRoadsWithoutSpeed?:boolean}={}) {
  const snapshot=Date.parse(snapshotAt); if(!Number.isFinite(snapshot)||snapshot>now+2000) throw new Error("A valid existing source snapshot date is required.");
  const collection=collectionSchema.parse(input); const candidates:OsmRoadCandidate[]=[]; const skipped:Record<string,number>={};
  const skip=(reason:string)=>{skipped[reason]=(skipped[reason]??0)+1;};
  const identities=new Set<string>();
  for(const raw of collection.features){
    const parsed=featureSchema.safeParse(raw); if(!parsed.success){skip("invalid_feature_or_geometry");continue;}
    const f=parsed.data; const props=f.properties;
    const version=props["@version"]; const edited=props["@timestamp"];
    // osmium exports Unix seconds; imported research files may use ISO timestamps.
    const editedMs=typeof edited==="number"&&Number.isSafeInteger(edited)?edited*1000:typeof edited==="string"?Date.parse(edited):NaN;
    if(typeof version!=="number"||!Number.isSafeInteger(version)||version<1||!Number.isFinite(editedMs)||editedMs<=0||editedMs>snapshot+2000){skip("missing_or_invalid_revision_metadata");continue;}
    const id=f.id.slice(1); if(!Number.isSafeInteger(Number(id))){skip("invalid_osm_id");continue;}
    const tags:Record<string,string>={};
    for(const [key,value] of Object.entries(props).sort(([a],[b])=>a<b?-1:a>b?1:0)) {
      if(typeof value==="string"&&value.length<=2000&&(/^(name|ref|highway|oneway|junction|layer|bridge|tunnel|width|access|motor_vehicle|vehicle|source|survey:date|check_date)$/.test(key)||/^(maxspeed(?::.*)?|source:maxspeed(?::.*)?)$/.test(key))) tags[key]=value;
    }
    if(!roadClasses.has(tags.highway)){skip("unsupported_road_class");continue;}
    const hasSpeed=Object.keys(tags).some((k)=>k==="maxspeed"||k.startsWith("maxspeed:"));
    if(!hasSpeed&&!(options.includeNamedRoadsWithoutSpeed&&tags.name?.trim())){skip("no_speed_metadata");continue;}
    // Geofabrik extract scope guard; not a claim these rectangular bounds are the national boundary.
    if(f.geometry.coordinates.some(([lon,lat])=>lon< -3.5||lon>1.5||lat<4.5||lat>11.5)){skip("outside_ghana_extract_bounds");continue;}
    if(f.geometry.coordinates.every(([lon,lat])=>lon===f.geometry.coordinates[0][0]&&lat===f.geometry.coordinates[0][1])){skip("zero_length_geometry");continue;}
    const key=`${id}:${version}`; if(identities.has(key))throw new Error("Duplicate OSM way revision in input; resolve before staging.");identities.add(key);
    const issues=["sign_or_authority_evidence_required","legal_effective_dates_unknown","geometry_accuracy_width_and_scope_need_review","vehicle_and_direction_applicability_unconfirmed","two_independent_reviews_required"];
    if(!hasSpeed)issues.push("no_speed_metadata");
    const roadDirection=tags.oneway==="-1"?"reverse":["yes","1","true"].includes(tags.oneway)?"forward":"both";
    if(tags.oneway&&!['-1','yes','1','true','no','0','false'].includes(tags.oneway))issues.push("unsupported_oneway_value");
    if(tags.junction==="roundabout"&&!tags.oneway)issues.push("roundabout_direction_needs_review");
    if(Object.entries(tags).some(([key,value])=>/^(source:maxspeed|maxspeed:type)/.test(key)&&/urban|rural|default|national/i.test(value)))issues.push("mapped_default_is_not_sign_evidence");
    const rules:OsmRoadCandidate["rules"]=[];
    for(const [tag,value] of Object.entries(tags)){
      if(!tag.startsWith("maxspeed"))continue;
      if(/conditional|lanes|variable/.test(tag)){issues.push("conditional_lane_or_variable_limit_requires_review");continue;}
      if(/advisory|type|reason|practical/.test(tag))continue;
      const pieces=tag.split(":");let direction:OsmRoadCandidate["rules"][number]["direction"]=roadDirection;let vehicleClass="all";let supported=pieces[0]==="maxspeed";
      for(const part of pieces.slice(1))if(part==="forward")direction="forward";else if(part==="backward")direction="reverse";else if(classes[part])vehicleClass=classes[part];else supported=false;
      if(!supported){issues.push("unsupported_vehicle_or_speed_tag");continue;}
      const speedLimitKmh=explicitKmh(value);if(speedLimitKmh===null){issues.push("unsupported_units_implicit_or_complex_value");continue;}
      if(roadDirection!=="both"&&direction!==roadDirection)issues.push("speed_direction_conflicts_with_oneway");
      rules.push({direction,vehicleClass,speedLimitKmh,originalTag:tag,originalValue:value});
    }
    if(!rules.length)issues.push("no_supported_explicit_kmh_rule");
    const candidate={osmWayId:id,osmVersion:version,osmEditedAt:new Date(editedMs).toISOString(),name:tags.name??tags.ref??null,roadClass:tags.highway,geometry:f.geometry,tags,rules,issues:[...new Set(issues)],sourceUrl:`https://www.openstreetmap.org/way/${id}/history`};
    candidates.push({...candidate,fingerprint:hash(JSON.stringify({osmWayId:id,osmVersion:version,osmEditedAt:candidate.osmEditedAt,geometry:f.geometry,tags}))});
  }
  return {snapshotAt:new Date(snapshotAt).toISOString(),candidates,skipped,inputFeatures:collection.features.length};
}
export async function stageOsmRoads(client:Client, prepared:ReturnType<typeof prepareOsmRoads>, contentSha256:string, actor:string) {
  if(!/^[a-f0-9]{64}$/.test(contentSha256)||!actor.trim()||actor.length>200)throw new Error("Valid source hash and operator identity required.");
  await client.query("BEGIN");
  try{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rova.osm_staging'))");
    await client.query("SELECT set_config('rova.actor_id',$1,true)",[actor]);
    const previous=await client.query("SELECT id FROM map_data_import_batches WHERE content_sha256=$1",[contentSha256]);
    if(previous.rowCount){await client.query("COMMIT");return {batchId:previous.rows[0].id,inserted:0,unchanged:prepared.candidates.length};}
    const batch=(await client.query("INSERT INTO map_data_import_batches(content_sha256,provider,source_url,license,attribution,imported_by,source_snapshot_at,accepted_count,skipped_count) VALUES($1,'OpenStreetMap / Geofabrik','https://download.geofabrik.de/africa/ghana.html','ODbL-1.0','© OpenStreetMap contributors',$2,$3,$4,$5) RETURNING id",[contentSha256,actor,prepared.snapshotAt,prepared.candidates.length,Object.values(prepared.skipped).reduce((a,b)=>a+b,0)])).rows[0].id;
    let inserted=0,unchanged=0;
    for(let start=0;start<prepared.candidates.length;start+=250){
      const chunk=prepared.candidates.slice(start,start+250);
      const identities=JSON.stringify(chunk.map(c=>({osm_way_id:c.osmWayId,osm_version:c.osmVersion})));
      const existing=await client.query("SELECT c.osm_way_id::text AS id,c.osm_version AS version,c.fingerprint FROM map_road_candidates c JOIN jsonb_to_recordset($1::jsonb) AS x(osm_way_id bigint,osm_version integer) ON c.osm_way_id=x.osm_way_id AND c.osm_version=x.osm_version",[identities]);
      const prior=new Map(existing.rows.map(r=>[`${r.id}:${r.version}`,r.fingerprint.trim()]));
      const fresh=chunk.filter(c=>{const found=prior.get(`${c.osmWayId}:${c.osmVersion}`);if(!found)return true;if(found!==c.fingerprint)throw new Error("Provider revision changed without a new version; staging rolled back.");unchanged++;return false;});
      if(!fresh.length)continue;
      const payload=JSON.stringify(fresh.map(c=>({osm_way_id:c.osmWayId,osm_version:c.osmVersion,osm_edited_at:c.osmEditedAt,fingerprint:c.fingerprint,geometry:c.geometry,road_name:c.name,road_class:c.roadClass,raw_tags:c.tags,proposed_rules:c.rules,review_issues:c.issues})));
      await client.query("INSERT INTO map_road_candidates(batch_id,osm_way_id,osm_version,osm_edited_at,fingerprint,geometry,road_name,road_class,raw_tags,proposed_rules,review_issues) SELECT $1::uuid,x.osm_way_id,x.osm_version,x.osm_edited_at,x.fingerprint,ST_SetSRID(ST_GeomFromGeoJSON(x.geometry::text),4326),x.road_name,x.road_class,x.raw_tags,x.proposed_rules,x.review_issues FROM jsonb_to_recordset($2::jsonb) AS x(osm_way_id bigint,osm_version integer,osm_edited_at timestamptz,fingerprint text,geometry jsonb,road_name text,road_class text,raw_tags jsonb,proposed_rules jsonb,review_issues jsonb)",[batch,payload]);inserted+=fresh.length;
    }
    await client.query("COMMIT");return {batchId:batch,inserted,unchanged};
  }catch(error){await client.query("ROLLBACK");throw error;}
}
export function osmReviewPack(prepared:ReturnType<typeof prepareOsmRoads>){
  return {type:"FeatureCollection",license:"ODbL-1.0",attribution:"© OpenStreetMap contributors",sourceSnapshotAt:prepared.snapshotAt,description:"UNVERIFIED mapping candidates for evidence collection. Not approved driving guidance.",features:prepared.candidates.map((c)=>({type:"Feature",id:`osm-way-${c.osmWayId}-v${c.osmVersion}`,geometry:c.geometry,properties:{roadName:c.name,sourceUrl:c.sourceUrl,osmEditedAt:c.osmEditedAt,mappedRules:c.rules,reviewIssues:c.issues,reviewState:"pending_review",evidence:{sourceKind:null,signOrAuthorityDocument:null,observedAt:null,effectiveFrom:null,expiresAt:null,vehicleApplicability:null,direction:null,geometryAccuracyMeters:null,roadWidthMeters:null,confidence:null,reviewers:[]},cameraRecords:[]}}))};
}
