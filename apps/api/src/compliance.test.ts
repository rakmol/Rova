import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { noticeOnRoute, type ComplianceCandidate } from "./compliance.js";
import { projectOnPath } from "./compliance-geometry.js";
import type { RoadCandidate, SafetySource, SafetyRule } from "./speed-limit.js";
const now = Date.parse("2026-11-08T00:00:00Z"); const iso = new Date(now - 1000).toISOString();
const event: ComplianceCandidate = { id: "TEST EVENT, NOT REAL DATA", revision: 1, kind: "transition", geometry: { coordinates: [[4.006, 4], [4.009, 4]] }, targetSegmentId: "target", targetRuleId: "target-rule", targetRuleRevision: 1, enforcementType: "unknown", confidence: 0.99, accuracyMeters: 2, effectiveFrom: iso, expiresAt: new Date(now + 86400000).toISOString(), reviewedAt: iso, sourceReference: "ISOLATED FIXTURE", probe: [4.0075, 4], probeHeading: 90 };
const fix = { lat: 4, lon: 4.004, heading: 90, accuracy: 5, timestamp: now, vehicleType: "private_car" as const };
const path: [number, number][] = [[4.003, 4], [4.01, 4]];
const source: SafetySource = { id: "test-source", kind: "official", status: "approved", synthetic: false, reviewedAt: iso, validFrom: iso, expiresAt: null, document: "ISOLATED TEST DOCUMENT", url: null };
const rule: SafetyRule = { id: "road-rule", speedLimitKmh: 60, units: "km/h", vehicleClass: "all", direction: "both", role: "road_limit", evidenceType: "official_record", legalApplicability: "confirmed", status: "published", synthetic: false, confidence: 0.98, effectiveFrom: iso, expiresAt: null, lastReviewedAt: iso, revision: 1, supersedesId: null, reference: "Test item", source, approvals: 2, oldestApprovalAt: iso, auditLogId: "1" };
const road: RoadCandidate = { id: "approach", distanceMeters: 1, roadKind: "road", gradeLevel: 0, roadWidthMeters: 6, direction: "both", bearing: 90, endpointMeters: 200, confidence: 0.98, accuracyMeters: 2, status: "published", synthetic: false, validFrom: iso, expiresAt: null, lastReviewedAt: iso, source, rules: [rule] };
test("route alignment rejects parallel, reversed, behind, stale and distant events without inventing warnings", () => {
  const position = projectOnPath([fix.lon, fix.lat], path)!;
  assert.ok(noticeOnRoute(event, path, position, fix, now));
  for (const changed of [
    { ...event, geometry: { coordinates: [[4.006, 4.0005], [4.009, 4.0005]] as [number, number][] } },
    { ...event, geometry: { coordinates: [...event.geometry.coordinates].reverse() } },
    { ...event, confidence: 0.5 }, { ...event, expiresAt: iso }, { ...event, reviewedAt: "invalid" },
  ]) assert.equal(noticeOnRoute(changed, path, position, fix, now), null);
  assert.equal(noticeOnRoute(event, path, position, { ...fix, heading: 270 }, now), null);
});
test("context HTTP contract binds a verified current limit and future proof to the route, obeys flags and fails closed", async () => {
  // Clock uses real current time in the HTTP handler; all evidence dates remain current.
  const realNow = Date.now(), realIso = new Date(realNow - 1000).toISOString();
  const currentSource = { ...source, reviewedAt: realIso, validFrom: realIso };
  const currentRule = { ...rule, effectiveFrom: realIso, lastReviewedAt: realIso, oldestApprovalAt: realIso, source: currentSource };
  const currentRoad = { ...road, source: currentSource, validFrom: realIso, lastReviewedAt: realIso, rules: [currentRule] };
  const currentEvent = { ...event, effectiveFrom: realIso, reviewedAt: realIso, expiresAt: new Date(realNow + 86400000).toISOString() };
  let failure = false; let unverifiedTarget = false;
  const db = { query: async (sql: string, params: unknown[]) => {
    if (failure) throw new Error("private credentials and coordinates");
    if (sql.includes("rova_compliance_candidates")) return { rows: [{ candidate: currentEvent }] };
    return { rows: [{ candidate: Number(params[0]) > 4.006 ? { ...currentRoad, id: "target", rules: [{ ...currentRule, id: "target-rule", speedLimitKmh: 50, status: unverifiedTarget ? "draft" : "published" }] } : currentRoad }] };
  }, on: () => {}, end: async () => {} } as unknown as Pool;
  const config = readConfig({ NODE_ENV: "test", LOG_LEVEL: "silent" });
  const app = await buildApp({ config, database: db, logger: false });
  const request = () => app.inject({ method: "POST", url: "/safety/alert-context", payload: { fix: { ...fix, timestamp: Date.now() }, path } });
  try {
    let result = await request(); assert.equal(result.statusCode, 200); assert.equal(result.json().limit.speedLimitKmh, 60); assert.equal(result.json().notices[0].speedLimitKmh, 50);
    assert.ok(!JSON.stringify(result.json().notices).includes('"coordinates"'));
    unverifiedTarget = true; assert.equal((await request()).json().notices.length, 0);
    failure = true; result = await request(); assert.equal(result.statusCode, 503); assert.equal(result.json().limit.status, "unknown"); assert.ok(!result.body.includes("credentials"));
    assert.equal((await app.inject({ method: "POST", url: "/safety/alert-context", payload: { fix, path: [[181, 4], [4, 4]] } })).statusCode, 400);
  } finally { await app.close(); }
  const disabled = await buildApp({ config: { ...config, COMPLIANCE_ALERTS_ENABLED: "false" }, database: db, logger: false });
  try { const result = await disabled.inject({ method: "POST", url: "/safety/alert-context", payload: { fix: { ...fix, timestamp: Date.now() }, path } }); assert.equal(result.json().limit.reason, "feature_disabled"); } finally { await disabled.close(); }
});
