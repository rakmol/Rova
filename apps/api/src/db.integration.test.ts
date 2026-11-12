import {checkPilotTelemetry,checkPilotCorridor,checkPilotIncident} from './pilot-integration.js';
import {postgresUsage} from './provider-usage.js';
import {storageProof} from './storage-proof.js';
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Client, Pool } from "pg";
import { loadMigrations, migrate } from "./migrations.js";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { noticeOnRoute } from "./compliance.js";
import { projectOnPath } from "./compliance-geometry.js";
import { hash,prepareOsmRoads,stageOsmRoads } from "./osm-road-import.js";
import {importReportedRoads}from'./reported-road-import.js';
import { processAccountDeletion, type DriverAuthProvider } from './accounts.js';
import type{AdminAuthProvider}from'./admin-auth.js';
import {revise,review,publish} from './admin-records.js';
import {runNotificationWorker,type PushTransport} from './notification-worker.js';
import {decryptPushToken} from './notifications.js';
import {accraAt,accraDay} from '@rova/shared';
const connectionString = process.env.TEST_DATABASE_URL;
test("real PostGIS migrations, constraints, synthetic isolation, review guards and append-only audit", { skip: !connectionString }, async (t) => {
  const url = new URL(connectionString!);
  if (!/^\/rova_test_[a-z0-9_]+$/.test(url.pathname) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require an explicitly disposable local rova_test_* database.");
  const client = new Client({ connectionString }); await client.connect();
  const fail = async (sql: string, params?: unknown[]) => assert.rejects(client.query(sql, params), (error: unknown) => typeof (error as { code?: string }).code === "string");
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    const migrations = await loadMigrations();
    await t.test("migrations apply once; checksums and transaction rollback protect the ledger", async () => {
      assert.equal((await migrate(client, migrations)).length, 14);
      assert.equal((await migrate(client, migrations)).length, 0);
      await assert.rejects(migrate(client, [{ ...migrations[0], checksum: "0".repeat(64) }, ...migrations.slice(1)]), /checksum mismatch/);
      await assert.rejects(migrate(client, [...migrations, { version: "099_failed_test.sql", checksum: "1".repeat(64), sql: "CREATE TABLE rollback_probe(id int); SELECT missing_function_for_test();" }]));
      assert.equal((await client.query("SELECT to_regclass('public.rollback_probe') AS probe")).rows[0].probe, null);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM schema_migrations")).rows[0].n, 14);
    });
    await t.test('pilot consent receipts are idempotent, reject private payloads, and serialize withdrawal against uploads',async()=>{const app=await buildApp({config:readConfig({NODE_ENV:'test',PILOT_TELEMETRY_ENABLED:'true',RATE_LIMIT_MAX:'1000'}),database:new Pool({connectionString}),logger:false});let token='';try{token=await checkPilotTelemetry(app,client);}finally{await app.close();}const off=await buildApp({config:readConfig({NODE_ENV:'test'}),database:new Pool({connectionString}),logger:false});try{assert.equal((await off.inject({method:'POST',url:'/v1/pilot/telemetry/session',payload:{consent:true,consentVersion:1}})).statusCode,503);assert.equal((await off.inject({method:'POST',url:'/v1/pilot/telemetry/erase',payload:{},headers:{authorization:'Bearer '+token}})).statusCode,200);}finally{await off.close();}});
    await t.test('shared provider quotas serialize replicas, persist across limiter restarts, and fail closed on configuration drift',async()=>{
      const pool=new Pool({connectionString,max:10});
      const base=readConfig({NODE_ENV:'test',PROVIDER_USAGE_SCOPE:'isolated-quota-test',PLACES_DAILY_REQUEST_BUDGET:'10',PROVIDER_SEARCH_MONTHLY_LIMIT:'3'});
      try{const a=postgresUsage(pool,base),b=postgresUsage(pool,base);const results=await Promise.allSettled(Array.from({length:12},(_,i)=>(i%2?a:b).reserve('geoapify','search',1)));assert.equal(results.filter(r=>r.status==='fulfilled').length,3);
        await assert.rejects(postgresUsage(pool,base).reserve('geoapify','search',1),(e:unknown)=>(e as{statusCode:number}).statusCode===429);
        const rows=(await pool.query('SELECT period,reserved::int FROM provider_usage WHERE scope=$1',[base.PROVIDER_USAGE_SCOPE])).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.reserved===3));
        await assert.rejects(postgresUsage(pool,{...base,PROVIDER_SEARCH_MONTHLY_LIMIT:100}).reserve('geoapify','search',1),(e:unknown)=>(e as{statusCode:number}).statusCode===503);
        const rate=postgresUsage(pool,{...base,PROVIDER_USAGE_SCOPE:'isolated-rate-test',PROVIDER_GEOAPIFY_RPS:1});await rate.attempt('geoapify');await pool.query("UPDATE provider_usage_state SET recent_calls=ARRAY[clock_timestamp()+interval '1 hour'] WHERE scope='isolated-rate-test'");await assert.rejects(rate.attempt('geoapify'),(e:unknown)=>(e as{statusCode:number}).statusCode===429);
        await pool.query("UPDATE provider_usage_state SET month=(date_trunc('month',clock_timestamp())-interval '1 month')::date WHERE scope='isolated-rate-test'");await assert.rejects(rate.attempt('geoapify'),(e:unknown)=>(e as{statusCode:number}).statusCode===429);
        const daily=postgresUsage(pool,{...base,PROVIDER_USAGE_SCOPE:'isolated-daily-test',PLACES_DAILY_REQUEST_BUDGET:1,PROVIDER_SEARCH_MONTHLY_LIMIT:100});await daily.reserve('geoapify','search',1);await assert.rejects(daily.reserve('geoapify','search',1));
        await pool.query("INSERT INTO provider_usage(scope,provider,meter,period,starts,reserved) VALUES('isolated-rollover-test','geoapify','search','month',date_trunc('month',now())::date-interval '1 month',100)");await postgresUsage(pool,{...base,PROVIDER_USAGE_SCOPE:'isolated-rollover-test'}).reserve('geoapify','search',1);
      }finally{await pool.end();}
    });
    await t.test("WGS84, coordinate bounds, non-empty geometry, confidence and validity are enforced", async () => {
      await fail("INSERT INTO road_segments(geometry,direction) VALUES(ST_GeomFromText('LINESTRING(181 0,182 1)',4326),'both')");
      await fail("INSERT INTO road_segments(geometry,direction) VALUES(ST_GeomFromText('LINESTRING(0 0,1 1)',3857),'both')");
      await fail("INSERT INTO road_segments(geometry,direction) VALUES(ST_GeomFromText('LINESTRING EMPTY',4326),'both')");
      await fail("INSERT INTO road_segments(geometry,direction,confidence) VALUES(ST_GeomFromText('LINESTRING(0 0,1 1)',4326),'both',1.5)");
      await fail("INSERT INTO road_segments(geometry,direction,accuracy_meters) VALUES(ST_GeomFromText('LINESTRING(0 0,1 1)',4326),'both','NaN')");
      await fail("INSERT INTO road_segments(geometry,direction,valid_from,expires_at) VALUES(ST_GeomFromText('LINESTRING(0 0,1 1)',4326),'both',now(),now()-interval '1 day')");
      const indices = await client.query("SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexdef ILIKE '%USING gist%'"); assert.equal(indices.rows[0].n, 10);
    });
    await t.test("demo seed is opt-in, idempotent and cannot appear as published or shed its synthetic provenance", async () => {
      const sql = await readFile(new URL("../db/demo-seed.sql", import.meta.url), "utf8");
      await assert.rejects(client.query(sql));
      await client.query("BEGIN");
      await client.query("SELECT set_config('rova.allow_synthetic_seed','on',true),set_config('rova.environment','production',true)");
      await assert.rejects(client.query(sql)); await client.query("ROLLBACK");
      for (let i = 0; i < 2; i++) { await client.query("BEGIN"); await client.query("SELECT set_config('rova.allow_synthetic_seed','on',true),set_config('rova.environment','test',true)"); await client.query(sql); await client.query("COMMIT"); }
      assert.equal((await client.query("SELECT count(*)::int AS n FROM road_segments WHERE is_synthetic")).rows[0].n, 1);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM published_speed_limit_rules")).rows[0].n, 0);
      await fail("UPDATE road_segments SET approval_status='published' WHERE is_synthetic");
      await fail("UPDATE speed_limit_rules SET status='approved' WHERE is_synthetic");
      await fail("UPDATE road_segments SET is_synthetic=false WHERE is_synthetic");
      await fail("UPDATE data_sources SET kind='official' WHERE kind='synthetic'");
    });
    let source: string; let road: string; let rule: string;
    await t.test("real approval requires reviewed source, approved road and two independent speed-rule reviewers", async () => {
      source = (await client.query("INSERT INTO data_sources(kind,authority,title,reference,created_by) VALUES('official','ISOLATED TEST FIXTURE','NOT REAL DATA','test-official','creator') RETURNING id")).rows[0].id;
      await client.query("UPDATE data_sources SET approval_status='approved',approved_by='reviewer',approved_at=now() WHERE id=$1", [source]);
      road = (await client.query("INSERT INTO road_segments(geometry,direction,source_id,source_reference,created_by,confidence) VALUES(ST_GeomFromText('LINESTRING(1 1,1.001 1.001)',4326),'both',$1,'test-road','creator',0.8) RETURNING id", [source])).rows[0].id;
      await client.query("UPDATE road_segments SET approval_status='published',approved_by='reviewer',approved_at=now(),road_kind='road',last_reviewed_at=now() WHERE id=$1", [road]);
      rule = (await client.query("INSERT INTO speed_limit_rules(road_segment_id,vehicle_class,speed_limit_kmh,status,created_by,source_id,source_reference,source_authority,source_document,evidence_reference,confidence,effective_from,last_reviewed_at,evidence_type,legal_applicability) VALUES($1,'private_car',30,'draft','creator',$2,'test-rule','test-authority','test-document','test-evidence',0.8,now(),now(),'official_record','confirmed') RETURNING id", [road, source])).rows[0].id;
      const approve = "UPDATE speed_limit_rules SET status='published',approved_by='reviewer',approved_at=now(),verified_by='reviewer',verified_at=now() WHERE id=$1";
      await fail(approve, [rule]);
      await client.query("INSERT INTO speed_rule_approvals(speed_rule_id,reviewer_id,decision,reason) VALUES($1,'reviewer-a','approve','isolated fixture'),($1,'reviewer-b','approve','isolated fixture')", [rule]);
      await client.query(approve, [rule]);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM published_speed_limit_rules")).rows[0].n, 1);
      await fail("UPDATE speed_limit_rules SET speed_limit_kmh=80 WHERE id=$1", [rule]);
      await client.query("UPDATE data_sources SET approval_status='withdrawn' WHERE id=$1", [source]);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM published_speed_limit_rules")).rows[0].n, 0);
    });
    await t.test("confirmations are unique per device; audit rows cannot be changed or deleted", async () => {
      const device = (await client.query("INSERT INTO devices(platform) VALUES('android') RETURNING id")).rows[0].id;
      const incident = (await client.query("INSERT INTO incident_reports(geometry,incident_type,description,observed_at,created_by) VALUES(ST_SetSRID(ST_MakePoint(1,1),4326),'hazard','ISOLATED TEST',now(),'test') RETURNING id")).rows[0].id;
      await client.query("INSERT INTO incident_confirmations(incident_report_id,device_id,decision) VALUES($1,$2,'confirm')", [incident, device]);
      await fail("INSERT INTO incident_confirmations(incident_report_id,device_id,decision) VALUES($1,$2,'deny')", [incident, device]);
      assert.ok((await client.query("SELECT count(*)::int AS n FROM audit_logs")).rows[0].n > 0);
      await fail("DELETE FROM audit_logs"); await fail("UPDATE audit_logs SET reason='changed'"); await fail("TRUNCATE audit_logs");
    });
    await t.test("HTTP imports normalize provenance, remain drafts and roll back duplicates atomically", async () => {
      const token = "isolated-test-admin-import-token-32-characters";
      const app = await buildApp({ config: readConfig({ NODE_ENV: "test", ROVA_ADMIN_IMPORT_TOKEN: token }), database: new Pool({ connectionString }), logger: false });
      const body = { sourceAuthority: "ISOLATED IMPORT TEST", sourceDocument: "NOT REAL ROAD DATA", sourceFileName: "test.csv", sourceFileSha256: "a".repeat(64), records: [{ source_reference: "test-item", source_url: "https://example.com/isolated-test", source_published_at: "2026-01-01", road_name: "ISOLATED TEST ROAD", direction: "both", vehicle_class: "private_car", speed_limit_kmh: "30", coordinates: "[[2,2],[2.001,2.001]]", effective_from: "2026-01-01", expires_at: "" }] };
      try {
        const result = await app.inject({ method: "POST", url: "/v1/admin/speed-rules/import", headers: { authorization: `Bearer ${token}` }, payload: body });
        assert.equal(result.statusCode, 201, result.body); assert.equal(result.json().status, "draft");
        const imported = await client.query("SELECT r.status,r.source_id,s.approval_status FROM speed_limit_rules r JOIN data_sources s ON s.id=r.source_id WHERE s.authority='ISOLATED IMPORT TEST'");
        assert.equal(imported.rows[0].status, "draft"); assert.equal(imported.rows[0].approval_status, "pending_review");
        const before = (await client.query("SELECT count(*)::int AS n FROM road_segments")).rows[0].n;
        const duplicate = await app.inject({ method: "POST", url: "/v1/admin/speed-rules/import", headers: { authorization: `Bearer ${token}` }, payload: body }); assert.equal(duplicate.statusCode, 409);
        assert.equal((await client.query("SELECT count(*)::int AS n FROM road_segments")).rows[0].n, before);
      } finally { await app.close(); }
    });
    await t.test("reader role can access filtered views but cannot read or change raw safety records", async () => {
      await client.query(await readFile(new URL("../db/roles.sql", import.meta.url), "utf8"));
      await client.query("SET ROLE rova_reader");
      try {
        assert.equal((await client.query("SELECT count(*)::int AS n FROM published_speed_limit_rules")).rows[0].n, 0);
        await fail("SELECT * FROM speed_limit_rules");
        await fail("UPDATE road_segments SET is_synthetic=false");
      } finally { await client.query("RESET ROLE"); }
    });
    await t.test("real safety lookup handles ramps, unverified parallel roads, stale reviews and revised rules", async () => {
      const sourceId = (await client.query("INSERT INTO data_sources(kind,authority,title,reference,created_by) VALUES('official','ISOLATED MATCHING TEST','NOT REAL DATA','matching-test','creator') RETURNING id")).rows[0].id;
      await client.query("UPDATE data_sources SET approval_status='approved',approved_by='reviewer',approved_at=now() WHERE id=$1", [sourceId]);
      const createRoad = async (wkt: string, kind: string, publish = true) => {
        const id = (await client.query("INSERT INTO road_segments(geometry,direction,source_id,source_reference,created_by,confidence,accuracy_meters,road_kind,road_width_meters,last_reviewed_at) VALUES(ST_GeomFromText($1,4326),'both',$2,'test-road','creator',0.98,2,$3,6,now()) RETURNING id", [wkt, sourceId, kind])).rows[0].id;
        if (publish) await client.query("UPDATE road_segments SET approval_status='published',approved_by='reviewer',approved_at=now() WHERE id=$1", [id]); return id;
      };
      const createRule = async (roadId: string, limit: number) => {
        const id = (await client.query("INSERT INTO speed_limit_rules(road_segment_id,vehicle_class,speed_limit_kmh,status,created_by,source_id,source_reference,source_authority,source_document,evidence_reference,confidence,effective_from,last_reviewed_at,evidence_type,legal_applicability) VALUES($1,'all',$2,'draft','creator',$3,'test-rule','test-authority','test-doc','test-evidence',0.98,now()-interval '1 day',now(),'official_record','confirmed') RETURNING id", [roadId, limit, sourceId])).rows[0].id;
        await client.query("INSERT INTO speed_rule_approvals(speed_rule_id,reviewer_id,decision,reason) VALUES($1,'reviewer-a','approve','isolated test'),($1,'reviewer-b','approve','isolated test')", [id]);
        await client.query("UPDATE speed_limit_rules SET status='published',approved_by='reviewer-a',approved_at=now(),verified_by='reviewer-a',verified_at=now() WHERE id=$1", [id]); return id;
      };
      const main = await createRoad("LINESTRING(4 4,4.01 4)", "road"); const mainRule = await createRule(main, 50);
      const app = await buildApp({ config: readConfig({ NODE_ENV: "test" }), database: new Pool({ connectionString }), logger: false });
      const lookup = async (lat = 4, lon = 4.005, heading = 90) => {
        const response = await app.inject(`/safety/speed-limit?lat=${lat}&lon=${lon}&heading=${heading}&accuracy=5&vehicleType=private_car&timestamp=${Date.now()}`);
        assert.equal(response.statusCode, 200, response.body); return response.json();
      };
      try {
        assert.equal((await lookup()).speedLimitKmh, 50);
        const parallel = await createRoad("LINESTRING(4 4.00004,4.01 4.00004)", "road", false);
        assert.equal((await lookup()).reason, "ambiguous_parallel_roads");
        await client.query("DELETE FROM road_segments WHERE id=$1", [parallel]);
        const ramp = await createRoad("LINESTRING(4.0049 4,4.0052 4.0001,4.0062 4.0007)", "ramp"); const rampRule = await createRule(ramp, 30);
        assert.equal((await lookup()).reason, "ambiguous_junction");
        const rampResult = await lookup(4.0004, 4.0057, 60); assert.equal(rampResult.status, "verified"); assert.equal(rampResult.speedLimitKmh, 30);
        // Use a point away from the ramp for revision/review tests.
        await client.query("UPDATE speed_limit_rules SET status='pending_review' WHERE id=$1", [mainRule]);
        await client.query("UPDATE speed_limit_rules SET last_reviewed_at=now()-interval '181 days' WHERE id=$1", [mainRule]);
        await client.query("UPDATE speed_limit_rules SET status='published' WHERE id=$1", [mainRule]);
        assert.equal((await lookup(4, 4.008)).reason, "stale_rule");
        await client.query("UPDATE speed_limit_rules SET status='pending_review' WHERE id=$1", [mainRule]);
        await client.query("UPDATE speed_limit_rules SET speed_limit_kmh=60,last_reviewed_at=now() WHERE id=$1", [mainRule]);
        await fail("UPDATE speed_limit_rules SET status='published' WHERE id=$1", [mainRule]);
        assert.equal((await lookup(4, 4.008)).reason, "unverified_rule");
        const revision = (await client.query("SELECT revision FROM speed_limit_rules WHERE id=$1", [mainRule])).rows[0].revision;
        await client.query("INSERT INTO speed_rule_approvals(speed_rule_id,reviewer_id,decision,reason,rule_revision) VALUES($1,'reviewer-a','approve','new revision',$2),($1,'reviewer-b','approve','new revision',$2)", [mainRule, revision]);
        await client.query("UPDATE speed_limit_rules SET status='published' WHERE id=$1", [mainRule]);
        assert.equal((await lookup(4, 4.008)).speedLimitKmh, 60);
        assert.equal((await client.query("SELECT count(*)::int AS n FROM speed_rule_approvals WHERE speed_rule_id=$1", [mainRule])).rows[0].n, 4);
        await client.query("UPDATE speed_rule_approvals SET decision='reject' WHERE speed_rule_id=$1 AND reviewer_id='reviewer-b' AND rule_revision=$2", [mainRule, revision]);
        assert.equal((await lookup(4, 4.008)).reason, "unverified_rule");
        const draft = (await client.query("INSERT INTO speed_limit_rules(road_segment_id,vehicle_class,speed_limit_kmh,status,created_by) VALUES($1,'all',20,'draft','isolated-test') RETURNING id", [main])).rows[0].id;
        await fail("UPDATE speed_limit_rules SET supersedes_rule_id=$2 WHERE id=$1", [draft, rampRule]);
        await client.query("UPDATE speed_limit_rules SET supersedes_rule_id=$2 WHERE id=$1", [draft, mainRule]);
        await client.query("UPDATE speed_limit_rules SET status='pending_review' WHERE id=$1", [mainRule]);
        await fail("UPDATE speed_limit_rules SET supersedes_rule_id=$2 WHERE id=$1", [mainRule, draft]);
        await fail("SELECT * FROM rova_speed_limit_candidates(4,4,500,'private_car')");
      } finally { await app.close(); }
    });
    await t.test("compliance events require official independent reviews; spatial API verifies transitions and suppresses withdrawn evidence", async () => {
      const sourceId = (await client.query("INSERT INTO data_sources(kind,authority,title,reference,created_by,approval_status,approved_by,approved_at) VALUES('official','DEMO ISOLATED TEST','NOT REAL DATA','compliance-fixture','creator','approved','source-reviewer',now()) RETURNING id")).rows[0].id;
      const roads: string[] = [];
      for (const wkt of ['LINESTRING(6 6,6.01 6)', 'LINESTRING(6.01 6,6.02 6)']) {
        roads.push((await client.query("INSERT INTO road_segments(geometry,direction,source_id,source_reference,created_by,confidence,accuracy_meters,road_kind,road_width_meters,last_reviewed_at,approval_status,approved_by,approved_at) VALUES(ST_GeomFromText($1,4326),'both',$2,'DEMO TEST ROAD','creator',0.99,2,'road',6,now(),'published','road-reviewer',now()) RETURNING id", [wkt, sourceId])).rows[0].id);
      }
      let targetRule = '';
      for (let i=0;i<roads.length;i++) {
        const id = (await client.query("INSERT INTO speed_limit_rules(road_segment_id,vehicle_class,speed_limit_kmh,status,created_by,source_id,source_reference,source_authority,source_document,evidence_reference,confidence,effective_from,last_reviewed_at,evidence_type,legal_applicability) VALUES($1,'all',$2,'draft','creator',$3,'DEMO TEST RULE','TEST','TEST','TEST',0.99,now()-interval '1 day',now(),'official_record','confirmed') RETURNING id", [roads[i],i===0?60:50,sourceId])).rows[0].id;
        await client.query("INSERT INTO speed_rule_approvals(speed_rule_id,reviewer_id,decision,reason) VALUES($1,'a','approve','DEMO TEST'),($1,'b','approve','DEMO TEST')", [id]);
        await client.query("UPDATE speed_limit_rules SET status='published',approved_by='a',approved_at=now(),verified_by='a',verified_at=now() WHERE id=$1",[id]); if(i===1) targetRule=id;
      }
      const eventId = (await client.query("INSERT INTO driver_compliance_events(kind,geometry,approach_segment_id,target_segment_id,target_rule_id,target_rule_revision,source_id,source_reference,legal_applicability,confidence,accuracy_meters,valid_from,expires_at,created_by) VALUES('transition',ST_GeomFromText('LINESTRING(6.01 6,6.02 6)',4326),$1,$2,$3,1,$4,'DEMO TRANSITION','confirmed',0.99,2,now()-interval '1 day',now()+interval '1 day','creator') RETURNING id", [roads[0],roads[1],targetRule,sourceId])).rows[0].id;
      await fail("UPDATE driver_compliance_events SET approval_status='published' WHERE id=$1", [eventId]);
      await client.query("UPDATE driver_compliance_events SET approval_status='published',reviewed_by='first',reviewed_at=now(),approved_by='second',approved_at=now() WHERE id=$1", [eventId]);
      await fail("UPDATE driver_compliance_events SET enforcement_type='mobile_camera' WHERE id=$1", [eventId]);
      await fail("UPDATE driver_compliance_events SET confidence=0.96 WHERE id=$1", [eventId]);
      assert.ok((await client.query("SELECT id FROM audit_logs WHERE entity_type='driver_compliance_events' AND entity_id=$1", [eventId])).rowCount);
      const eventRows=await client.query("SELECT candidate FROM rova_compliance_candidates(6.008,6,$1) AS events(candidate)",[roads[0]]);
      assert.equal(eventRows.rows.length,1,'Published event candidate must remain visible');
      const testPath: [number,number][]=[[6.007,6],[6.014,6]];
      assert.ok(noticeOnRoute(eventRows.rows[0].candidate,testPath,projectOnPath([6.008,6],testPath)!,{lat:6,lon:6.008,heading:90,accuracy:5,timestamp:Date.now(),vehicleType:'private_car'},Date.now()),JSON.stringify(eventRows.rows[0].candidate));
      const app = await buildApp({ config: readConfig({ NODE_ENV:'test' }), database: new Pool({connectionString}), logger:false });
      const request = () => app.inject({ method:'POST',url:'/safety/alert-context',payload:{fix:{lat:6,lon:6.008,heading:90,accuracy:5,timestamp:Date.now(),vehicleType:'private_car'},path:[[6.007,6],[6.014,6]]} });
      try {
        let result=await request(); assert.equal(result.statusCode,200,result.body); assert.equal(result.json().limit.speedLimitKmh,60); assert.equal(result.json().notices[0]?.speedLimitKmh,50,result.body);
        const zone=(await client.query("INSERT INTO enforcement_zones(geometry,zone_type,description,source_id,source_reference,accuracy_meters,confidence,approval_status,valid_from,expires_at,created_by,approved_by,approved_at) VALUES(ST_GeomFromText('POLYGON((6.0084 5.9999,6.0096 5.9999,6.0096 6.0001,6.0084 6.0001,6.0084 5.9999))',4326),'camera','DEMO CORRIDOR, NOT REAL',$1,'DEMO ZONE',2,0.99,'published',now()-interval '1 day',now()+interval '1 day','creator','zone-reviewer',now()) RETURNING id",[sourceId])).rows[0].id;
        const corridor=(await client.query("INSERT INTO driver_compliance_events(kind,geometry,approach_segment_id,target_segment_id,enforcement_zone_id,enforcement_type,source_id,source_reference,legal_applicability,confidence,accuracy_meters,valid_from,expires_at,created_by) VALUES('corridor',ST_GeomFromText('LINESTRING(6.0085 6,6.0095 6)',4326),$1,$1,$2,'average_speed',$3,'DEMO CORRIDOR','confirmed',0.99,2,now()-interval '1 day',now()+interval '1 day','creator') RETURNING id",[roads[0],zone,sourceId])).rows[0].id;
        await client.query("UPDATE driver_compliance_events SET approval_status='published',reviewed_by='first',reviewed_at=now(),approved_by='second',approved_at=now() WHERE id=$1",[corridor]);
        result=await request(); assert.equal(result.json().enforcementStatus,'verified_corridor'); assert.equal(result.json().notices.find((n:{kind:string})=>n.kind==='corridor')?.enforcementType,'average_speed');
        await client.query("UPDATE enforcement_zones SET approval_status='withdrawn' WHERE id=$1",[zone]);
        result=await request(); assert.equal(result.json().enforcementStatus,'unavailable/unverified'); assert.ok(result.json().notices.some((n:{kind:string})=>n.kind==='transition'));
        await client.query("UPDATE data_sources SET approval_status='withdrawn' WHERE id=$1",[sourceId]); result=await request(); assert.equal(result.json().limit.status,'unknown'); assert.equal(result.json().notices.length,0);
        await client.query("UPDATE data_sources SET approval_status='approved' WHERE id=$1",[sourceId]);
        await client.query("UPDATE driver_compliance_events SET approval_status='pending_review' WHERE id=$1",[eventId]);
        await client.query("UPDATE driver_compliance_events SET confidence=0.96 WHERE id=$1",[eventId]);
        const changed=(await client.query("SELECT revision,reviewed_by,approved_by FROM driver_compliance_events WHERE id=$1",[eventId])).rows[0]; assert.equal(changed.revision,2);assert.equal(changed.reviewed_by,null);assert.equal(changed.approved_by,null);
        await fail("UPDATE driver_compliance_events SET approval_status='published' WHERE id=$1",[eventId]);
      } finally { await app.close(); }
    });
    await t.test("OSM staging preserves geometry and license, deduplicates atomically and cannot populate verified driving data", async () => {
      const snapshot=new Date(Date.now()-1000).toISOString();
      const raw={type:'FeatureCollection',features:[{type:'Feature',id:'w999999999991',geometry:{type:'LineString',coordinates:[[-0.2,5.6],[-0.19,5.6]]},properties:{'@version':1,'@timestamp':snapshot,highway:'primary',name:'ISOLATED DEMO ROAD',maxspeed:'80'}}]};
      const prepared=prepareOsmRoads(raw,snapshot);const before=(await client.query("SELECT count(*)::int AS n FROM road_segments")).rows[0].n;
      const first=await stageOsmRoads(client,prepared,hash(JSON.stringify(raw)),'test-import-automation');assert.equal(first.inserted,1);
      assert.equal((await stageOsmRoads(client,prepared,hash(JSON.stringify(raw)),'test-import-automation')).inserted,0);
      const row=(await client.query("SELECT review_state,proposed_rules,ST_SRID(geometry) AS srid FROM map_road_candidates WHERE osm_way_id=999999999991")).rows[0];assert.equal(row.review_state,'pending_review');assert.equal(row.srid,4326);assert.equal(row.proposed_rules[0].speedLimitKmh,80);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM road_segments")).rows[0].n,before);
      await fail("UPDATE map_road_candidates SET review_state='published'");
      const conflict=structuredClone(raw);conflict.features[0].properties.maxspeed='50';
      await assert.rejects(stageOsmRoads(client,prepareOsmRoads(conflict,snapshot),hash(JSON.stringify(conflict)),'test-import-automation'),/revision changed/);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM map_data_import_batches")).rows[0].n,1);
      assert.equal((await client.query("SELECT license FROM map_data_import_batches")).rows[0].license,'ODbL-1.0');
      assert.ok((await client.query("SELECT id FROM audit_logs WHERE entity_type='map_road_candidates'")).rowCount);
      const report={id:'DEMO REPORT',area:'ISOLATED DEMO ROAD',city:'accra'as const,sourceUrl:'https://example.com/demo-report',publishedAt:new Date(Date.now()-86400000).toISOString(),sourceUpdatedAt:null};
      const associations=await importReportedRoads(client,[report],'test-import-automation');assert.equal(associations.advisories.length,1);
      const app=await buildApp({config:readConfig({NODE_ENV:'test'}),database:new Pool({connectionString}),logger:false});
      try{const lookup=()=>app.inject({method:'POST',url:'/safety/alert-context',payload:{fix:{lat:5.6,lon:-.195,accuracy:5,heading:90,timestamp:Date.now(),vehicleType:'private_car'},path:[[-.196,5.6],[-.19,5.6]]}});
        const response=await lookup();assert.equal(response.statusCode,200,response.body);assert.equal(response.json().limit.status,'unknown');assert.equal(response.json().reportedRoads.notices[0]?.verification,'unverified',response.body);
        await client.query('UPDATE reported_road_advisories SET enabled=false');assert.equal((await lookup()).json().reportedRoads.notices.length,0);
      }finally{await app.close();}
    });
    await t.test('community hazards: privacy, concurrent duplicates, voting conflicts, moderation revisions, expiry and quotas',async()=>{
      const token='isolated-community-moderator-token-32-characters';
      const app=await buildApp({config:readConfig({NODE_ENV:'test',RATE_LIMIT_MAX:'1000',ROVA_INCIDENT_MODERATOR_TOKEN:token}),database:new Pool({connectionString}),logger:false});
      const fix={lon:-.20123456,lat:5.61234567,accuracy:12,timestamp:Date.now()};
      let source=1;
      const session=async()=>{const r=await app.inject({method:'POST',url:'/v1/incidents/session',remoteAddress:`192.0.2.${source++}`,payload:{platform:'android'}});assert.equal(r.statusCode,201,r.body);return {authorization:`Bearer ${r.json().token}`};};
      try{
        const author=await session(),voter=await session(),voter2=await session();const moderator={authorization:`Bearer ${token}`};
        const submit=()=>app.inject({method:'POST',url:'/v1/incidents',headers:author,payload:{category:'pothole',fix,interaction:'passenger',note:'ISOLATED private note'}});
        const parallel=await Promise.all([submit(),submit()]);assert.deepEqual(parallel.map(r=>r.statusCode).sort(),[200,201]);
        const id=parallel[0].json().id;assert.equal(id,parallel[1].json().id);
        const nearby=()=>app.inject({url:'/v1/incidents/nearby?lon=-.20123456&lat=5.61234567',headers:voter});
        let reports=(await nearby()).json().reports;assert.equal(reports.length,1);assert.deepEqual(reports[0].coordinate,[-.201,5.612]);assert.equal(reports[0].status,'pending');assert.equal(reports[0].authorityVerified,false);
        const publicBody=(await nearby()).body;for(const secret of ['ISOLATED private note','submitted_by_device','device_id','token_hash','-0.20123456'])assert.ok(!publicBody.includes(secret),secret);
        assert.equal((await app.inject('/v1/admin/incidents')).statusCode,401);
        const vote=(headers:Record<string,string>,decision='confirm',position=fix)=>app.inject({method:'POST',url:`/v1/incidents/${id}/votes`,headers,payload:{decision,fix:position,interaction:'passenger'}});
        assert.equal((await vote(author)).statusCode,409);
        assert.equal((await vote(voter,'confirm',{...fix,lon:-.3})).statusCode,400);
        let r=await vote(voter);assert.equal(r.statusCode,201,r.body);assert.equal(r.json().confirmations,1);
        assert.equal((await vote(voter)).statusCode,409);
        const moderate=(revision:number,status='verified')=>app.inject({method:'POST',url:`/v1/admin/incidents/${id}/moderate`,headers:moderator,payload:{revision,status,reason:'ISOLATED evidence review'}});
        assert.equal((await moderate(1)).statusCode,409);
        r=await moderate(2);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().status,'verified');assert.equal(r.json().authorityVerified,false);
        const approved=()=>app.inject({url:'/v1/incidents/approved?lon=-.201&lat=5.612',headers:voter});
        assert.equal((await approved()).json().reports[0].id,id);
        assert.equal((await app.inject({url:'/v1/incidents/approved?lon=1&lat=10',headers:voter})).json().reports.length,0);
        const address=await app.listen({host:'127.0.0.1',port:0});
        const controller=new AbortController();
        try{
          const stream=await fetch(`${address}/v1/incidents/stream?lon=-.201&lat=5.612`,{headers:voter,signal:controller.signal});
          assert.equal(stream.status,200);assert.match(stream.headers.get('content-type')??'',/text\/event-stream/);
          const reader=stream.body!.getReader();const chunk=await reader.read();const frame=new TextDecoder().decode(chunk.value);
          assert.ok(frame.includes('event: snapshot'));assert.ok(frame.includes(id));assert.ok(!frame.includes('ISOLATED private note'));
          const metrics=(await app.inject({url:'/v1/admin/incidents/realtime-metrics',headers:moderator})).json();
          assert.equal(metrics.activeConnections,1);assert.equal(metrics.activeRegions,1);assert.ok(metrics.databaseReads>=2);
          // Withdrawal is a full replacement on the next region refresh, not an additive event.
          await client.query("UPDATE incident_reports SET community_status='pending' WHERE id=$1",[id]);
          const next=await reader.read();assert.ok(!new TextDecoder().decode(next.value).includes(id));
          await client.query("UPDATE incident_reports SET community_status='verified' WHERE id=$1",[id]);
          controller.abort();await reader.cancel().catch(()=>{});
        }finally{controller.abort();}
        assert.equal((await vote(voter2,'not_there')).statusCode,201);
        const voter3=await session();r=await vote(voter3,'not_there');assert.equal(r.statusCode,201,r.body);assert.equal(r.json().status,'pending');
        assert.equal((await moderate(3,'rejected')).statusCode,409);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM moderation_actions WHERE entity_id=$1',[id])).rows[0].n,1);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM published_incident_reports WHERE id=$1',[id])).rows[0].n,0);
        await client.query("UPDATE incident_reports SET observed_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE id=$1",[id]);
        assert.equal((await nearby()).json().reports.length,0);assert.equal((await vote(voter3)).statusCode,409);assert.equal((await moderate(5)).statusCode,409);
        assert.equal((await approved()).json().reports.length,0);
        // First two submissions already used the per-device quota, including the duplicate.
        for(let i=0;i<3;i++)assert.ok([200,201].includes((await submit()).statusCode));
        assert.equal((await submit()).statusCode,429);
        assert.equal((await app.inject({method:'POST',url:'/v1/incidents',headers:voter,payload:{category:'flood',fix:{...fix,timestamp:Date.now()-61000},interaction:'passenger'}})).statusCode,400);
        const stored=(await client.query('SELECT ST_X(geometry) AS lon,ST_Y(geometry) AS lat,accuracy_meters FROM incident_reports WHERE id=$1',[id])).rows[0];assert.equal(stored.lon,-.201);assert.equal(stored.lat,5.612);assert.equal(stored.accuracy_meters,150);
        await fail("UPDATE incident_reports SET geometry=ST_SetSRID(ST_MakePoint(-.20123456,5.61234567),4326) WHERE id=$1",[id]);
        const erased=await app.inject({method:'POST',url:'/v1/incidents/erase-device',headers:author,payload:{}});assert.equal(erased.statusCode,200,erased.body);
        const anonymous=(await client.query('SELECT submitted_by_device,description FROM incident_reports WHERE id=$1',[id])).rows[0];assert.equal(anonymous.submitted_by_device,null);assert.equal(anonymous.description,'Anonymous community road report');
        assert.equal((await app.inject({url:'/v1/incidents/nearby?lon=-.2&lat=5.6',headers:author})).statusCode,401);
      }finally{await app.close();}
    });
    await t.test('driver accounts require provider validation, isolate ownership and administrator privileges, and delete via durable retry',async()=>{
      const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
      let unavailable=true;const deleted:string[]=[];const sent:string[]=[];
      const auth:DriverAuthProvider={issuer:'https://test.supabase.co/auth/v1',sendCode:async email=>{sent.push(email);},verify:async()=>({accessToken:'a'.repeat(32),refreshToken:'r'.repeat(32),expiresAt:Date.now()+3600000}),refresh:async()=>({accessToken:'a'.repeat(32),refreshToken:'r'.repeat(32),expiresAt:Date.now()+3600000}),user:async token=>{if(token==='driver-a')return{id:a};if(token==='driver-b')return{id:b};throw Object.assign(new Error('invalid'),{statusCode:401});},signOut:async()=>{},deleteUser:async subject=>{if(unavailable)throw new Error('isolated provider outage');deleted.push(subject);}};
      const pool=new Pool({connectionString});const app=await buildApp({config:readConfig({NODE_ENV:'test',PLACES_STORAGE_SIGNING_KEY:'isolated-storage-signing-key-1234567890',ROVA_INCIDENT_MODERATOR_TOKEN:'separate-admin-moderator-secret-token-32'}),database:pool,driverAuth:auth,logger:false});
      const ha={authorization:'Bearer driver-a'},hb={authorization:'Bearer driver-b'};
      const preferences={voiceEnabled:false,voiceLanguage:'en-GB',units:'imperial'};
      const place={clientKey:'home',kind:'home',label:'ISOLATED HOME',address:'TEST ONLY',attribution:'User entered',lon:-.2,lat:5.6};
      try{
        assert.equal((await app.inject('/v1/auth/status')).json().guestNavigation,true);
        assert.equal((await app.inject('/v1/me')).statusCode,401);
        assert.equal((await app.inject({url:'/v1/me',headers:{authorization:'Bearer forged'}})).statusCode,401);
        assert.equal((await app.inject({method:'POST',url:'/v1/auth/code',payload:{email:'Driver@Example.com'}})).statusCode,200);assert.deepEqual(sent,['driver@example.com']);
        assert.equal((await app.inject({method:'POST',url:'/v1/auth/verify',payload:{email:'driver@example.com',code:'123456'}})).statusCode,200);
        const first=(await app.inject({url:'/v1/me',headers:ha})).json();assert.equal(first.role,'driver');
        const fakePlace={...place,attribution:'Geoapify',storageProof:'forged'};
        assert.equal((await app.inject({method:'POST',url:'/v1/me/sync',headers:ha,payload:{places:[fakePlace],preferences}})).statusCode,400);
        const receipt=storageProof('geoapify',[place.lon,place.lat],'isolated-storage-signing-key-1234567890');
        assert.equal((await app.inject({method:'POST',url:'/v1/me/sync',headers:ha,payload:{places:[{...fakePlace,storageProof:receipt}],preferences}})).statusCode,200);
        assert.equal((await app.inject({url:'/v1/me',headers:ha})).json().places[0].storageProof,receipt);
        const sync=()=>app.inject({method:'POST',url:'/v1/me/sync',headers:ha,payload:{places:[place],preferences}});
        assert.equal((await sync()).statusCode,200);assert.equal((await app.inject({url:'/v1/me',headers:ha})).json().places.length,1);
        assert.equal((await app.inject({url:'/v1/me',headers:hb})).json().places.length,0);
        assert.equal((await app.inject({method:'POST',url:'/v1/me/sync',headers:hb,payload:{places:[place],preferences,userId:first.id}})).statusCode,400);
        assert.equal((await app.inject({url:'/v1/admin/incidents',headers:ha})).statusCode,401);
        assert.equal((await app.inject({method:'POST',url:'/v1/me/erase-data',headers:ha,payload:{}})).statusCode,200);assert.equal((await app.inject({url:'/v1/me',headers:ha})).json().places.length,0);
        await sync();
        const removal=await app.inject({method:'POST',url:'/v1/me/delete-account',headers:ha,payload:{confirm:'DELETE'}});assert.equal(removal.statusCode,202,removal.body);
        assert.equal((await app.inject({url:'/v1/me',headers:ha})).statusCode,403);assert.equal((await sync()).statusCode,403);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM driver_saved_places WHERE user_id=$1',[first.id])).rows[0].n,0);
        assert.equal((await client.query('SELECT completed_at FROM driver_deletion_jobs WHERE user_id=$1',[first.id])).rows[0].completed_at,null);
        unavailable=false;assert.equal(await processAccountDeletion(pool,auth,first.id,a),true);assert.deepEqual(deleted,[a]);
        assert.ok((await client.query('SELECT completed_at FROM driver_deletion_jobs WHERE user_id=$1',[first.id])).rows[0].completed_at);
        assert.equal((await app.inject({url:'/v1/me',headers:hb})).statusCode,200);
        assert.equal((await app.inject({method:'POST',url:'/v1/me/delete-account',headers:hb,payload:{confirm:'DELETE'}})).statusCode,200);
      }finally{await app.close();}
    });
    await t.test('operations password login, RBAC, revision approvals, publication isolation, revert and immutable before/after audit',async()=>{
      const issuer='https://ops-test.supabase.co/auth/v1';
      const ids={administrator:'20000000-0000-4000-8000-000000000001',editor:'20000000-0000-4000-8000-000000000002',reviewer:'20000000-0000-4000-8000-000000000003',reviewer2:'20000000-0000-4000-8000-000000000004',viewer:'20000000-0000-4000-8000-000000000005'};
      const factorId='20000000-0000-4000-8000-000000000099';
      const session=(subject:string,aal:string)=>({accessToken:subject+':'+aal,refreshToken:'test-refresh',expiresAt:Date.now()+3600000});
      const auth:AdminAuthProvider={identity:async token=>{const[subject,aal]=token.split(':');if(!Object.values(ids).includes(subject))throw Object.assign(new Error('Invalid test identity'),{statusCode:401});return{subject,issuer,aal:aal==='aal2'?'aal2':'aal1',expiresAt:Date.now()+3600000};},signIn:async email=>session(ids[email.split('@')[0]as keyof typeof ids],'aal1'),memberExists:async id=>Object.values(ids).includes(id)};
      for(const[key,subject]of Object.entries(ids))await client.query("INSERT INTO admin_members(issuer,subject,role,granted_by) VALUES($1,$2,$3,'test-bootstrap')",[issuer,subject,key==='reviewer2'?'reviewer':key]);
      const app=await buildApp({config:readConfig({NODE_ENV:'test',RATE_LIMIT_MAX:'1000'}),database:new Pool({connectionString}),adminAuth:auth,logger:false});
      const headers:Record<string,{authorization:string}>={};
      const send=(who:string,url:string,payload:unknown)=>app.inject({method:'POST',url:'/v1/ops/'+url,payload:JSON.stringify(payload),headers:{...headers[who],'content-type':'application/json'}});
      try{
        assert.equal((await app.inject('/v1/ops/overview')).statusCode,401);
        for(const who of Object.keys(ids)){
          const login=await app.inject({method:'POST',url:'/v1/ops/login',payload:{email:who+'@test.invalid',password:'test-only-password'}});assert.equal(login.statusCode,200,login.body);
          headers[who]={authorization:'Bearer '+login.json().accessToken};
          assert.equal((await app.inject({url:'/v1/ops/overview',headers:headers[who]})).statusCode,200);
          assert.equal((await app.inject({url:'/v1/ops/session',headers:headers[who]})).json().mfaRequired,false);
          assert.equal((await send(who,'verify',{code:'123456'})).statusCode,404);
        }
        assert.equal((await app.inject({url:'/v1/ops/overview',headers:headers.viewer})).statusCode,200);
        const costs=await app.inject({url:'/v1/ops/provider-costs',headers:headers.viewer});assert.equal(costs.statusCode,200,costs.body);assert.ok(Array.isArray(costs.json().actualUsage));assert.equal(costs.json().usageStatus,'available');assert.equal(costs.json().monthlyEnforcement,'database_shared');assert.equal(costs.json().alertDelivery,'not_configured');assert.equal((await app.inject('/v1/ops/provider-costs')).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/v1/ops/provider-costs',headers:headers.administrator,payload:{monthlyQuota:1}})).statusCode,404);
        const date=new Date(Date.now()-60000).toISOString(),expiry=new Date(Date.now()+30*86400000).toISOString();
        const source={kind:'field_audit',authority:'ISOLATED ADMIN TEST',title:'TEST FIELD SIGN DOCUMENT',reference:'TEST ONLY',source_url:'https://example.com/test-evidence',license_note:'ISOLATED AUTOMATED TEST',published_at:date,valid_from:date,expires_at:expiry};
        assert.equal((await send('viewer','revise',{entity:'source',id:null,data:source,comment:'ISOLATED test creation'})).statusCode,403);
        assert.equal((await send('reviewer','revise',{entity:'source',id:null,data:source,comment:'ISOLATED test creation'})).statusCode,403);
        const create=async(entity:string,data:unknown)=>{const r=await send('editor','revise',{entity,id:null,data,comment:'ISOLATED test evidence creation'});assert.equal(r.statusCode,200,r.body);return r.json();};
        const approve=async(revisionId:string)=>{for(const who of ['reviewer','reviewer2']){const r=await send(who,'review',{revisionId,decision:'approve',comment:'ISOLATED independent evidence review'});assert.equal(r.statusCode,200,r.body);}};
        const publish=async(revisionId:string)=>{const r=await send('administrator','publish',{revisionId,comment:'ISOLATED reviewed publication'});assert.equal(r.statusCode,200,r.body);};
        const sponsorData={business_name:'ISOLATED SPONSOR NOT A REAL BUSINESS',category:'mechanic',description:'ISOLATED TEST COPY',geometry:{type:'Point',coordinates:[-.2,5.6]},address:'TEST ONLY',region:'ISOLATED TEST REGION',website:'https://example.com/business',contact_phone:'+233200000000',business_evidence_url:'https://example.com/evidence',evidence_reference:'ISOLATED TEST ONLY',sponsor_label:'Sponsored',price_plan:'proposal_basic',valid_from:new Date(Date.now()-60*86400000).toISOString(),expires_at:expiry};
        assert.equal((await send('viewer','revise',{entity:'sponsor',id:null,data:sponsorData,comment:'ISOLATED forbidden draft'})).statusCode,403);
        assert.equal((await send('editor','revise',{entity:'sponsor',id:null,data:{...sponsorData,sponsor_label:'Verified'},comment:'ISOLATED misleading label'})).statusCode,400);
        assert.equal((await send('editor','revise',{entity:'sponsor',id:null,data:{...sponsorData,locationHistory:[]},comment:'ISOLATED forbidden tracking'})).statusCode,400);
        const sponsor=await create('sponsor',sponsorData);await approve(sponsor.revisionId);
        const blocked=await send('administrator','publish',{revisionId:sponsor.revisionId,comment:'ISOLATED delivery must stay locked'});assert.equal(blocked.statusCode,409,blocked.body);
        await fail("UPDATE sponsored_listings SET approval_status='published' WHERE id=$1",[sponsor.id]);
        assert.equal((await app.inject('/v1/sponsored')).statusCode,404);assert.equal((await app.inject({method:'POST',url:'/v1/sponsored/events',payload:{}})).statusCode,404);
        const sparse=await create('sponsor',{...sponsorData,business_name:'ISOLATED LOW COUNT FIXTURE'});
        await client.query("INSERT INTO sponsored_daily_metrics(listing_id,day,impressions,opens,contact_actions) VALUES($1,current_date-1,35,13,7),($2,current_date-1,19,1,0)",[sponsor.id,sparse.id]);
        const metrics=await app.inject({url:'/v1/ops/sponsored',headers:headers.viewer});assert.equal(metrics.statusCode,200,metrics.body);assert.equal(metrics.json().enabled,false);assert.equal(metrics.json().collectionEnabled,false);assert.equal(metrics.json().rows.length,1);assert.equal(metrics.json().rows[0].impressions,'30');assert.equal(metrics.json().rows[0].opens,'10');assert.equal(metrics.json().rows[0].contact_actions,'0');assert.equal((await app.inject('/v1/ops/sponsored')).statusCode,401);
        const sponsorEdit=await send('editor','revise',{entity:'sponsor',id:sponsor.id,expected:1,data:{...sponsorData,description:'ISOLATED changed copy requires review'},comment:'ISOLATED renewed sponsor review'});assert.equal(sponsorEdit.statusCode,200,sponsorEdit.body);
        assert.equal((await send('reviewer','review',{revisionId:sponsor.revisionId,decision:'approve',comment:'ISOLATED stale sponsor approval'})).statusCode,409);
        const sponsorList=await app.inject({url:'/v1/ops/records?entity=sponsor',headers:headers.viewer});assert.equal(sponsorList.statusCode,200,sponsorList.body);assert.ok(sponsorList.json().rows.some((row:any)=>row.id===sponsor.id));
        const s=await create('source',source);
        assert.equal((await send('administrator','publish',{revisionId:s.revisionId,comment:'ISOLATED premature publication'})).statusCode,409);
        assert.equal((await send('editor','publish',{revisionId:s.revisionId,comment:'ISOLATED forbidden publication'})).statusCode,403);
        await approve(s.revisionId);await publish(s.revisionId);
        const road={geometry:{type:'LineString',coordinates:[[-.32,5.8],[-.31,5.8]]},direction:'both',road_name:'ISOLATED ADMIN ROAD',source_id:s.id,source_reference:'TEST ROAD',accuracy_meters:3,confidence:.97,valid_from:date,expires_at:expiry,road_kind:'road',grade_level:0,road_width_meters:8};
        const r=await create('road',road);await approve(r.revisionId);await publish(r.revisionId);
        const rule={road_segment_id:r.id,vehicle_class:'private_car',speed_limit_kmh:40,source_id:s.id,source_reference:'TEST SIGN',accuracy_meters:3,confidence:.97,direction:'both',evidence_reference:'TEST SIGN EVIDENCE',source_authority:'ISOLATED ADMIN TEST',source_document:'TEST FIELD SIGN DOCUMENT',source_url:'https://example.com/test-evidence',source_published_at:date,effective_from:date,expires_at:expiry,units:'km/h',evidence_type:'posted_signage',legal_applicability:'confirmed',rule_role:'road_limit'};
        const limit=await create('rule',rule);
        const lookup=()=>app.inject(`/safety/speed-limit?lat=5.8&lon=-0.315&heading=90&accuracy=5&timestamp=${Date.now()}&vehicleType=private_car`);
        assert.equal((await lookup()).json().status,'unknown');await approve(limit.revisionId);await publish(limit.revisionId);assert.equal((await lookup()).json().speedLimitKmh,40);
        const pilotApp=await buildApp({config:readConfig({NODE_ENV:'test',PILOT_REGION_GATING_ENABLED:'true',RATE_LIMIT_MAX:'1000'}),database:new Pool({connectionString}),adminAuth:auth,logger:false});try{await checkPilotCorridor(pilotApp,client,headers,r.id,s.id);}finally{await pilotApp.close();}
        const offlineApp=await buildApp({config:readConfig({NODE_ENV:'test',OFFLINE_SAFETY_ENABLED:'true',OFFLINE_SAFETY_SOURCE_IDS:s.id}),database:new Pool({connectionString}),logger:false});
        try{const pack=await offlineApp.inject('/safety/offline-pack?lon=-.315&lat=5.8&vehicleType=private_car');assert.equal(pack.statusCode,200,pack.body);assert.equal(pack.json().roads.find((v:any)=>v.record.id===r.id).record.rules[0].speedLimitKmh,40);}finally{await offlineApp.close();}
        const changed=await send('editor','revise',{entity:'rule',id:limit.id,expected:1,data:{...rule,speed_limit_kmh:60},comment:'ISOLATED changed evidence requires new review'});assert.equal(changed.statusCode,200,changed.body);
        assert.equal((await lookup()).json().status,'unknown');
        const pendingOffline=await buildApp({config:readConfig({NODE_ENV:'test',OFFLINE_SAFETY_ENABLED:'true',OFFLINE_SAFETY_SOURCE_IDS:s.id}),database:new Pool({connectionString}),logger:false});
        try{const pack=await pendingOffline.inject('/safety/offline-pack?lon=-.315&lat=5.8&vehicleType=private_car');assert.equal(pack.statusCode,200,pack.body);assert.deepEqual(pack.json().roads.find((v:any)=>v.record.id===r.id).record.rules,[]);}finally{await pendingOffline.close();}
        assert.equal((await send('reviewer','review',{revisionId:limit.revisionId,decision:'approve',comment:'ISOLATED stale revision'})).statusCode,409);
        const reverted=await send('editor','revert',{revisionId:changed.json().revisionId,expected:2,comment:'ISOLATED revert still requires review'});assert.equal(reverted.statusCode,200,reverted.body);assert.equal(reverted.json().sequence,3);
        assert.equal((await lookup()).json().status,'unknown');await fail("UPDATE speed_limit_rules SET status='published' WHERE id=$1",[limit.id]);
        assert.equal((await send('administrator','member',{subject:ids.administrator,role:'viewer',active:true,comment:'ISOLATED cannot remove final admin'})).statusCode,409);
        const hazard=await create('hazard',{geometry:{type:'Point',coordinates:[-.201234,5.612345]},incident_type:'pothole',description:'ISOLATED ADMIN HAZARD',accuracy_meters:150,observed_at:date,expires_at:expiry});
        const hazardDetail=await app.inject({url:`/v1/ops/detail?entity=hazard&id=${hazard.id}`,headers:headers.editor});
        assert.equal(hazardDetail.statusCode,200,hazardDetail.body);assert.deepEqual(hazardDetail.json().editable.geometry.coordinates,[-.201,5.612]);
        assert.equal((await send('reviewer','review',{revisionId:hazard.revisionId,decision:'approve',comment:'ISOLATED community hazard review'})).statusCode,200);
        await publish(hazard.revisionId);
        // Community votes are dynamic evidence, not an unreviewed change to hazard facts.
        await checkPilotIncident(app,client,headers,hazard.id);
        const hazardEdit=await send('editor','revise',{entity:'hazard',id:hazard.id,expected:1,data:{...hazardDetail.json().editable,description:'ISOLATED UPDATED HAZARD'},comment:'ISOLATED hazard edit requires another review'});
        assert.equal(hazardEdit.statusCode,200,hazardEdit.body);assert.equal(hazardEdit.json().status,'pending');
        assert.equal((await send('administrator','logout',{})).statusCode,200);
        assert.equal((await app.inject({url:'/v1/ops/overview',headers:headers.administrator})).statusCode,403);
        await fail("UPDATE admin_revisions SET comment='rewritten'");await fail('DELETE FROM admin_reviews');await fail('TRUNCATE admin_action_logs');
        const log=await app.inject({url:'/v1/ops/audit',headers:headers.viewer});assert.ok(log.json().rows.some((row:any)=>row.action==='revert'&&row.before_json&&row.after_json));
        assert.equal((await app.inject({url:'/v1/ops/sponsored',headers:headers.viewer})).json().enabled,false);
        assert.equal((await app.inject({url:'/v1/ops/coverage',headers:headers.viewer})).json().enabled,false);
      }finally{await app.close();}
    });
    await t.test('opt-in push ownership, coarse regions, verified policies, queue deduplication, caps, expiry, withdrawal and deletion',async()=>{
      const key='cd'.repeat(32),config=readConfig({NODE_ENV:'test',RATE_LIMIT_MAX:'1000',NOTIFICATION_TOKEN_KEY:key,PUSH_DELIVERY_ENABLED:'true',EXPO_PUSH_ACCESS_TOKEN:'isolated-test-no-real-sends'});
      const pool=new Pool({connectionString}),app=await buildApp({config,database:pool,logger:false});
      const actor=(name:string,role:'editor'|'reviewer'|'administrator')=>({subject:'30000000-0000-4000-8000-000000000001',issuer:'isolated-test',aal:'aal1' as const,expiresAt:Date.now()+3600000,name,role,token:'isolated'});
      const create=async(entity:'source'|'policy',data:unknown)=>revise(pool,actor('notification-editor','editor'),entity,null,undefined,data,'ISOLATED notification fixture');
      const approve=async(id:string)=>{for(const who of ['notification-reviewer1','notification-reviewer2'])await review(pool,actor(who,'reviewer'),id,'approve','ISOLATED independent test review');await publish(pool,actor('notification-publisher','administrator'),id,'ISOLATED test publication');};
      const now=new Date(Date.now()-60000).toISOString(),expiry=new Date(Date.now()+86400000).toISOString();
      try{
        const start=await app.inject({method:'POST',url:'/v1/notifications/session',payload:{platform:'android'}});assert.equal(start.statusCode,200,start.body);const token=start.json().token,headers={authorization:'Bearer '+token};
        assert.equal((await app.inject('/v1/notifications/preferences')).statusCode,401);
        const prefs={enabled:true,closures:true,policy:true,marketing:false,currentTrip:false,timeZone:'Africa/Accra',dailyCap:2,permission:'granted',regions:[{id:'test-region',label:'ISOLATED REGION',lon:-.20123,lat:5.61234}],expoToken:'ExponentPushToken[isolated_fixture_token_12345]'};
        const save=async(p:unknown)=>app.inject({method:'POST',url:'/v1/notifications/preferences',headers,payload:p as any});
        assert.equal((await save({...prefs,currentTrip:true})).statusCode,400);assert.equal((await save({...prefs,permission:'denied'})).statusCode,400);assert.equal((await save(prefs)).statusCode,200);
        const own=(await app.inject({url:'/v1/notifications/preferences',headers})).json();assert.equal(own.regions[0].lon,-.2);assert.equal(own.regions[0].lat,5.62);assert.ok(!JSON.stringify(own).includes('PushToken'));
        const installation=(await client.query('SELECT id,device_id FROM notification_installations WHERE enabled')).rows[0];const push=(await client.query('SELECT * FROM push_tokens WHERE device_id=$1',[installation.device_id])).rows[0];assert.equal(decryptPushToken(push.token_ciphertext,key),prefs.expoToken);
        const other=await app.inject({method:'POST',url:'/v1/notifications/session',payload:{platform:'android'},remoteAddress:'127.0.0.2'});assert.equal((await app.inject({url:'/v1/notifications/preferences',headers:{authorization:'Bearer '+other.json().token}})).json().regions.length,0);
        const source=await create('source',{kind:'official',authority:'ISOLATED TEST',title:'NOT REAL POLICY SOURCE',reference:'ISOLATED TEST ONLY',source_url:'https://example.com/test',license_note:'ISOLATED FIXTURE',published_at:now,valid_from:now,expires_at:expiry});await approve(source.revisionId);
        const policies:{id:string|null;revisionId:string}[]=[];for(let i=0;i<4;i++){const p=await create('policy',{title:'ISOLATED POLICY '+i,body:'NOT A REAL ANNOUNCEMENT',source_id:source.id,source_reference:'TEST DOCUMENT',source_url:'https://example.com/policy',valid_from:now,expires_at:expiry});if(i===0){await assert.rejects(publish(pool,actor('notification-publisher','administrator'),p.revisionId,'ISOLATED premature publication'));await fail("UPDATE policy_announcements SET approval_status='published' WHERE id=$1",[p.id]);}await approve(p.revisionId);policies.push(p);}
        const midday=()=>accraAt(accraDay(Date.now()),12),sent:string[]=[],fake:PushTransport={send:async(_t,_k,id)=>{sent.push(id);return{kind:'accepted',ticketId:'ticket-'+id};},receipts:async ids=>Object.fromEntries(ids.map(id=>[id,{status:'ok' as const}]))};
        const quiet=await runNotificationWorker(pool,config,fake,20,()=>accraAt(accraDay(Date.now()),22));assert.ok('deferred' in quiet);assert.equal(quiet.deferred,4);assert.equal(sent.length,0);await client.query("UPDATE notification_queue SET available_at=now()-interval '1 minute' WHERE status='pending'");
        const first=await runNotificationWorker(pool,config,fake,20,midday);assert.ok('accepted' in first);assert.equal(first.accepted,2);assert.equal(sent.length,2);await runNotificationWorker(pool,config,fake,20,midday);assert.equal(sent.length,2);
        assert.equal((await client.query('SELECT count(*)::int AS n FROM notification_queue WHERE installation_id=$1',[installation.id])).rows[0].n,4);
        await client.query("UPDATE notification_reservations SET reserved_at=now()-interval '2 days'");for(let n=0;n<4;n++)await client.query("INSERT INTO notification_reservations(queue_id,token_fingerprint,reserved_at) VALUES(gen_random_uuid(),$1,now()-interval '2 days')",[push.token_fingerprint]);await client.query("UPDATE notification_queue SET available_at=now()-interval '1 minute' WHERE status='pending'");await runNotificationWorker(pool,config,fake,20,midday);assert.equal(sent.length,2);
        await client.query("UPDATE notification_queue SET accepted_at=now()-interval '16 minutes' WHERE status='accepted'");await runNotificationWorker(pool,config,fake,0,midday);assert.equal((await client.query("SELECT count(*)::int AS n FROM notification_queue WHERE status='confirmed'")).rows[0].n,2);
        await client.query("UPDATE policy_announcements SET approval_status='withdrawn' WHERE id=$1",[policies[0].id]);const inbox=(await app.inject({url:'/v1/notifications/inbox',headers})).json();assert.ok(!inbox.items.some((p:any)=>p.id===policies[0].id));
        await client.query("UPDATE notification_queue SET available_at=now()-interval '1 minute',expires_at=now()-interval '1 second' WHERE status='pending'");await runNotificationWorker(pool,config,fake,20,midday);assert.equal(sent.length,2);
        await client.query("UPDATE notification_installations SET lease_until=now()-interval '1 second' WHERE id=$1",[installation.id]);assert.deepEqual((await app.inject({url:'/v1/notifications/inbox',headers})).json().items,[]);
        assert.equal((await save({...prefs,enabled:false})).statusCode,200);assert.equal((await client.query('SELECT count(*)::int AS n FROM push_tokens WHERE device_id=$1 AND revoked_at IS NULL',[installation.device_id])).rows[0].n,0);
        assert.equal((await app.inject({method:'POST',url:'/v1/notifications/erase',headers,payload:{}})).statusCode,200);assert.equal((await client.query('SELECT count(*)::int AS n FROM notification_regions WHERE installation_id=$1',[installation.id])).rows[0].n,0);assert.equal((await app.inject({url:'/v1/notifications/preferences',headers})).statusCode,401);
      }finally{await app.close();}
    });
    await t.test("legacy baseline preserves rows and approvals while returning unreviewed source publications to review", async () => {
      await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
      for (const migration of migrations.slice(0, 2)) await client.query(migration.sql);
      const legacyRoad = (await client.query("INSERT INTO road_segments(geometry,direction) VALUES(ST_GeomFromText('LINESTRING(3 3,3.001 3.001)',4326),'both') RETURNING id")).rows[0].id;
      const legacyRule = (await client.query("INSERT INTO speed_rules(road_segment_id,vehicle_class,speed_limit_kmh,status,created_by,evidence_reference,source_authority,source_document,source_reference) VALUES($1,'private_car',30,'draft','creator','test-evidence','LEGACY TEST','TEST DOCUMENT','test-reference') RETURNING id", [legacyRoad])).rows[0].id;
      await client.query("INSERT INTO speed_rule_approvals(speed_rule_id,reviewer_id,decision,reason) VALUES($1,'a','approve','test'),($1,'b','approve','test')", [legacyRule]);
      await client.query("UPDATE speed_rules SET status='published',verified_by='a',verified_at=now() WHERE id=$1", [legacyRule]);
      await assert.rejects(migrate(client, migrations), /baseline-legacy/);
      assert.deepEqual(await migrate(client, migrations, true), ["003_backend_foundation.sql", "004_verified_speed_matching.sql", "005_driver_compliance_alerts.sql", "006_map_data_review_staging.sql", "007_reported_road_advisories.sql", "008_community_incidents.sql", "009_driver_accounts.sql", "010_admin_review.sql", "011_opt_in_notifications.sql", "012_sponsorship_prelaunch.sql", "013_batch_a_protection.sql", "014_accra_pilot.sql"]);
      const preserved = await client.query("SELECT status,source_id FROM speed_limit_rules WHERE id=$1", [legacyRule]);
      assert.equal(preserved.rows[0].status, "pending_review"); assert.ok(preserved.rows[0].source_id);
      assert.equal((await client.query("SELECT count(*)::int AS n FROM speed_rule_approvals WHERE speed_rule_id=$1", [legacyRule])).rows[0].n, 2);
    });
  } finally { await client.end(); }
});
