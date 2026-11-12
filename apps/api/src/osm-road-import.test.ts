import assert from "node:assert/strict";
import test from "node:test";
import { explicitKmh,osmReviewPack,prepareOsmRoads } from "./osm-road-import.js";
import { renderOsmReviewMap } from "./osm-review-map.js";
const date='2026-11-07T21:21:36Z';
const feature=(tags:Record<string,string>={maxspeed:'50'})=>({type:'Feature',id:'w12345',geometry:{type:'LineString',coordinates:[[-0.2,5.6],[-0.19,5.6]]},properties:{'@version':2,'@timestamp':date,highway:'primary',name:'DEMO TEST ROAD','@user':'do-not-store-editor-identity','@uid':123,...tags}});
const prepare=(f:unknown)=>prepareOsmRoads({type:'FeatureCollection',features:[f]},date);
test('only explicit supported km/h values become proposals; defaults and other units remain unresolved',()=>{
  for(const value of ['30','80','50 km/h','100 kph'])assert.ok(explicitKmh(value));
  for(const value of ['80 mph','50;80','GH:urban','none','walk','0','201','50.5','30 @ (wet)'])assert.equal(explicitKmh(value),null);
  const result=prepare(feature({maxspeed:'80 mph'}));assert.equal(result.candidates[0].rules.length,0);assert.ok(result.candidates[0].issues.includes('unsupported_units_implicit_or_complex_value'));
});
test('direction and vehicle proposals preserve tags while conditional and lane rules stay flagged for human review',()=>{
  const result=prepare(feature({maxspeed:'80','maxspeed:forward':'50','maxspeed:backward':'60','maxspeed:hgv':'40','maxspeed:conditional':'30 @ wet','maxspeed:lanes':'50|80',oneway:'no'}));
  const rules=result.candidates[0].rules;
  assert.ok(rules.some(r=>r.direction==='forward'&&r.speedLimitKmh===50));assert.ok(rules.some(r=>r.direction==='reverse'&&r.speedLimitKmh===60));assert.ok(rules.some(r=>r.vehicleClass==='heavy_vehicle'&&r.speedLimitKmh===40));
  assert.ok(result.candidates[0].issues.includes('conditional_lane_or_variable_limit_requires_review'));
  const reverse=prepare(feature({maxspeed:'50',oneway:'-1'}));assert.equal(reverse.candidates[0].rules[0].direction,'reverse');
});
test('snapshot and edit timestamps never become legal dates or verification; review pack carries evidence blanks and license',()=>{
  const result=prepare(feature());assert.equal(result.candidates[0].tags['@user'],undefined);assert.equal(result.candidates[0].tags['@uid'],undefined);
  const pack=osmReviewPack(result);assert.equal(pack.license,'ODbL-1.0');assert.equal(pack.features[0].properties.evidence.effectiveFrom,null);assert.equal(pack.features[0].properties.evidence.confidence,null);assert.deepEqual(pack.features[0].properties.evidence.reviewers,[]);assert.deepEqual(pack.features[0].properties.cameraRecords,[]);assert.equal(pack.features[0].properties.reviewState,'pending_review');
});
test('osmium Unix-second timestamps are preserved correctly; source road names cannot inject review-page scripts',()=>{
  const f=feature();(f.properties as Record<string,unknown>)['@timestamp']=Date.parse(date)/1000;
  f.properties.name='</script><script>throw new Error("injected")</script>';
  const result=prepare(f);assert.equal(result.candidates[0].osmEditedAt,new Date(date).toISOString());
  const html=renderOsmReviewMap(result);assert.ok(!html.includes(f.properties.name));assert.ok(html.includes('\\u003c/script\\u003e'));assert.ok(html.includes('This tool cannot publish rules'));
});
test('bad geometry, missing revision metadata and non-road features cannot quietly enter staging; duplicates are rejected',()=>{
  const missing=feature();delete (missing.properties as Record<string,unknown>)['@version'];assert.equal(prepare(missing).candidates.length,0);
  const bad=feature();bad.geometry.coordinates=[[181,5.6],[0,5.6]];assert.equal(prepare(bad).candidates.length,0);
  assert.equal(prepare(feature({highway:'footway'})).candidates.length,0);
  const zero=feature();zero.geometry.coordinates=[[-.2,5.6],[-.2,5.6]];assert.equal(prepare(zero).candidates.length,0);
  assert.throws(()=>prepareOsmRoads({type:'FeatureCollection',features:[feature(),feature()]},date),/Duplicate/);
  assert.throws(()=>prepareOsmRoads({type:'FeatureCollection',features:[]},'not-a-date'),/snapshot/);
});
test('named-road context can be staged without a speed tag, preserving an unknown limit',()=>{
 const f=feature();delete(f.properties as Record<string,unknown>).maxspeed;
 assert.equal(prepare(f).candidates.length,0);
 const context=prepareOsmRoads({type:'FeatureCollection',features:[f]},date,Date.now(),{includeNamedRoadsWithoutSpeed:true});assert.equal(context.candidates.length,1);assert.deepEqual(context.candidates[0].rules,[]);assert.ok(context.candidates[0].issues.includes('no_speed_metadata'));
});
