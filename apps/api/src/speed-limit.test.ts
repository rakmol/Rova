import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import Fastify from "fastify";
import { registerSpeedLimitRoute } from "./speed-limit-route.js";
import { evaluateSpeedLimit, type RoadCandidate, type SafetyFix, type SafetyRule, type SafetySource } from "./speed-limit.js";
const now = Date.parse("2026-11-08T00:00:00Z");
const iso = (days = 0) => new Date(now - days * 86400000).toISOString();
const source: SafetySource = { id: "test-source", kind: "official", status: "approved", synthetic: false, reviewedAt: iso(), validFrom: iso(10), expiresAt: null, document: "ISOLATED TEST DOCUMENT, NOT REAL DATA", url: "https://example.com/test-document" };
const rule: SafetyRule = { id: "test-rule", speedLimitKmh: 50, units: "km/h", vehicleClass: "all", direction: "both", role: "road_limit", evidenceType: "official_record", legalApplicability: "confirmed", status: "published", synthetic: false, confidence: 0.98, effectiveFrom: iso(10), expiresAt: null, lastReviewedAt: iso(), revision: 1, supersedesId: null, reference: "Test item", source, approvals: 2, oldestApprovalAt: iso(), auditLogId: "1" };
const road: RoadCandidate = { id: "test-road", distanceMeters: 1, roadKind: "road", gradeLevel: 0, roadWidthMeters: 6, direction: "both", bearing: 90, endpointMeters: 500, confidence: 0.98, accuracyMeters: 2, status: "published", synthetic: false, validFrom: iso(10), expiresAt: null, lastReviewedAt: iso(), source, rules: [rule] };
const fix: SafetyFix = { lon: 0, lat: 0, heading: 90, accuracy: 5, vehicleType: "private_car", timestamp: now };
const reason = (candidates: RoadCandidate[], input = fix) => { const result = evaluateSpeedLimit(input, candidates, now); assert.equal(result.status, "unknown"); return result.status === "unknown" ? result.reason : undefined; };
test("only a fresh, current, independently reviewed rule on a confident unambiguous road is returned with evidence", () => {
  const result = evaluateSpeedLimit(fix, [road], now); assert.equal(result.status, "verified");
  if (result.status === "verified") { assert.equal(result.speedLimitKmh, 50); assert.equal(result.units, "km/h"); assert.equal(result.rules[0].auditLogId, "1"); assert.equal(result.rules[0].source.document, source.document); }
  assert.equal(reason([road], { ...fix, timestamp: undefined }), "timestamp_required");
  assert.equal(reason([road], { ...fix, timestamp: now - 11000 }), "stale_gps");
  assert.equal(reason([road], { ...fix, timestamp: now + 3000 }), "future_gps");
  assert.equal(reason([road], { ...fix, accuracy: 50 }), "poor_gps_accuracy");
  assert.equal(reason([road], { ...fix, heading: undefined }), "heading_required");
});
test("parallel carriageways, ramps, junctions and different levels remain unknown inside GPS uncertainty", () => {
  assert.equal(reason([road, { ...road, id: "parallel", distanceMeters: 6 }]), "ambiguous_parallel_roads");
  assert.equal(reason([road, { ...road, id: "uncertain-parallel", distanceMeters: 12 }]), "ambiguous_parallel_roads");
  assert.equal(reason([road, { ...road, id: "wide-main-road", roadWidthMeters: 50, distanceMeters: 30 }]), "ambiguous_parallel_roads");
  assert.equal(reason([road, { ...road, id: "poorly-located-road", accuracyMeters: 100, distanceMeters: 80 }]), "ambiguous_parallel_roads");
  assert.equal(reason([road, { ...road, id: "unverified-ramp", roadKind: "ramp", status: "draft", distanceMeters: 6 }]), "ambiguous_parallel_roads");
  assert.equal(reason([road, { ...road, id: "crossing", bearing: 0, distanceMeters: 2 }]), "ambiguous_junction");
  assert.equal(reason([road, { ...road, id: "flyover", gradeLevel: 1, distanceMeters: 2 }]), "ambiguous_levels");
  assert.equal(reason([{ ...road, endpointMeters: 3 }]), "near_segment_boundary");
  const ramp = evaluateSpeedLimit(fix, [{ ...road, roadKind: "ramp", rules: [{ ...rule, speedLimitKmh: 30 }] }, { ...road, id: "main", distanceMeters: 30 }], now);
  assert.equal(ramp.status === "verified" ? ramp.speedLimitKmh : null, 30);
});
test("heading is checked against the nearest physical road, never used to jump across to a more convenient carriageway", () => {
  assert.equal(reason([{ ...road, direction: "forward", bearing: 270 }, { ...road, id: "other-lane", distanceMeters: 20, direction: "forward" }]), "heading_mismatch");
  assert.equal(reason([{ ...road, rules: [{ ...rule, direction: "reverse" }] }]), "no_applicable_rule");
  assert.equal(reason([{ ...road, rules: [{ ...rule, vehicleClass: "heavy_vehicle" }] }]), "no_applicable_rule");
});
test("unverified, stale, expired, incomplete or low-confidence records cannot leak a numeric limit", () => {
  assert.equal(reason([{ ...road, status: "draft" }]), "unverified_segment");
  assert.equal(reason([{ ...road, accuracyMeters: null }]), "low_confidence_segment");
  assert.equal(reason([{ ...road, lastReviewedAt: iso(366) }]), "stale_segment");
  for (const change of [{ status: "draft" }, { approvals: 1 }, { legalApplicability: "unconfirmed" }, { auditLogId: null }]) assert.equal(reason([{ ...road, rules: [{ ...rule, ...change }] }]), "unverified_rule");
  assert.equal(reason([{ ...road, rules: [{ ...rule, lastReviewedAt: iso(181) }] }]), "stale_rule");
  assert.equal(reason([{ ...road, rules: [{ ...rule, oldestApprovalAt: iso(181) }] }]), "stale_rule");
  assert.equal(reason([{ ...road, rules: [{ ...rule, confidence: 0.8 }] }]), "low_confidence_rule");
  assert.equal(reason([{ ...road, rules: [{ ...rule, expiresAt: iso(1) }] }]), "no_applicable_rule");
  assert.equal(reason([{ ...road, rules: [{ ...rule, source: { ...source, reviewedAt: iso(366) } }] }]), "stale_source");
  assert.equal(reason([{ ...road, synthetic: true }]), "no_road_match");
});
test("current legal signage overrides generalized defaults, explicit supersession can replace older evidence, and conflicts stay unknown", () => {
  const defaultRule = { ...rule, id: "default", evidenceType: "general_default", speedLimitKmh: 70 };
  const sign = { ...rule, id: "sign", evidenceType: "posted_signage", speedLimitKmh: 40 };
  const result = evaluateSpeedLimit(fix, [{ ...road, rules: [defaultRule, sign] }], now);
  assert.equal(result.status === "verified" ? result.speedLimitKmh : null, 40);
  assert.equal(reason([{ ...road, rules: [defaultRule, { ...sign, status: "draft" }] }]), "unverified_rule");
  const replacement = { ...rule, id: "replacement", speedLimitKmh: 30, supersedesId: "sign" };
  const replaced = evaluateSpeedLimit(fix, [{ ...road, rules: [sign, replacement] }], now);
  assert.equal(replaced.status === "verified" ? replaced.speedLimitKmh : null, 30);
  assert.equal(reason([{ ...road, rules: [sign, { ...replacement, approvals: 0 }] }]), "pending_supersession");
  assert.equal(reason([{ ...road, rules: [rule, { ...rule, id: "conflict", speedLimitKmh: 60 }] }]), "conflicting_rules");
});
test("vehicle caps remain binding alongside posted road limits and private source credentials are not returned", () => {
  const result = evaluateSpeedLimit({ ...fix, vehicleType: "heavy_vehicle" }, [{ ...road, rules: [rule, { ...rule, id: "truck-cap", role: "vehicle_cap", vehicleClass: "heavy_vehicle", speedLimitKmh: 30, source: { ...source, url: "https://example.com/file?token=private" } }] }], now);
  assert.equal(result.status, "verified"); if (result.status === "verified") { assert.equal(result.speedLimitKmh, 30); assert.equal(result.rules[1].source.url, null); }
});
test("HTTP contract rejects malformed GPS, requires fix age, and fails closed on database outage", async () => {
  let calls = 0;
  const database = { query: async () => { calls++; throw new Error("private-coordinate-and-password"); }, end: async () => {}, on: () => {} } as unknown as Pool;
  const app = await buildApp({ config: readConfig({ NODE_ENV: "test" }), database, logger: false });
  const base = "/safety/speed-limit?lat=5.6&lon=-0.2&heading=90&accuracy=5&vehicleType=private_car";
  try {
    assert.equal((await app.inject(base)).json().reason, "timestamp_required"); assert.equal(calls, 0);
    assert.equal((await app.inject(base.replace("lat=5.6", "lat="))).statusCode, 400);
    assert.equal((await app.inject(base.replace("vehicleType=private_car", "vehicleType=unknown"))).statusCode, 400);
    assert.equal((await app.inject(base + "&timestamp=1")).json().reason, "stale_gps"); assert.equal(calls, 0);
    const failure = await app.inject(base + `&timestamp=${Date.now()}`); assert.equal(failure.statusCode, 503); assert.equal(failure.json().status, "unknown"); assert.equal(failure.json().speedLimitKmh, null); assert.ok(!failure.body.includes("password"));
  } finally { await app.close(); }
});
test("a slow lookup cannot return a numeric limit after its GPS fix has become stale", async () => {
  let clock = now;
  const database = { query: async () => { clock += 11000; return { rows: [{ candidate: road }] }; } } as unknown as Pool;
  const app = Fastify(); registerSpeedLimitRoute(app, database, () => clock);
  try { const response = await app.inject(`/safety/speed-limit?lat=0&lon=0&heading=90&accuracy=5&vehicleType=private_car&timestamp=${now}`); assert.equal(response.statusCode, 200); assert.equal(response.json().reason, "stale_gps"); assert.equal(response.json().speedLimitKmh, null); } finally { await app.close(); }
});
