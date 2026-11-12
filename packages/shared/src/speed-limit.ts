import type { VehicleClass } from "./index";
export interface SafetyFix { lat: number; lon: number; heading?: number; accuracy: number; vehicleType: VehicleClass; timestamp?: number }
export interface SafetySource { id: string; kind: string; status: string; synthetic: boolean; reviewedAt: string | null; validFrom: string | null; expiresAt: string | null; document: string; url: string | null }
export interface SafetyRule { id: string; speedLimitKmh: number | null; units: string; vehicleClass: string; direction: string; role: string; evidenceType: string; legalApplicability: string; status: string; synthetic: boolean; confidence: number | null; effectiveFrom: string | null; expiresAt: string | null; lastReviewedAt: string | null; revision: number; supersedesId: string | null; reference: string | null; source: SafetySource | null; approvals: number; oldestApprovalAt: string | null; auditLogId: string | null }
export interface RoadCandidate { id: string; distanceMeters: number; roadKind: string; gradeLevel: number | null; roadWidthMeters: number | null; direction: string; bearing: number | null; endpointMeters: number; confidence: number | null; accuracyMeters: number | null; status: string; synthetic: boolean; validFrom: string | null; expiresAt: string | null; lastReviewedAt: string | null; source: SafetySource | null; rules: SafetyRule[] }
const reasons = {
  timestamp_required: "Supply the GPS fix timestamp in Unix milliseconds.", stale_gps: "The GPS reading is older than ten seconds.", future_gps: "The GPS timestamp is in the future.", poor_gps_accuracy: "GPS uncertainty is too large for a reliable road match.", heading_required: "A reliable travel heading is required.", no_road_match: "No mapped road is sufficiently close.", ambiguous_parallel_roads: "GPS uncertainty overlaps parallel roads or a nearby ramp.", ambiguous_junction: "The position is ambiguous near a junction or crossing.", ambiguous_levels: "GPS cannot distinguish nearby roads on different levels.", near_segment_boundary: "The position is too close to a segment boundary to establish applicability.", heading_mismatch: "Travel heading does not match the closest road.", unverified_segment: "The matched road geometry has not been sufficiently verified.", low_confidence_segment: "Road geometry confidence or accuracy is insufficient.", stale_segment: "The road geometry needs a current review.", no_applicable_rule: "No current rule applies to this road, direction and vehicle.", unverified_rule: "The rule lacks current independent verification or applicability evidence.", low_confidence_rule: "The rule confidence is below the serving threshold.", stale_rule: "The rule or its independent reviews need renewal.", unverified_source: "The authoritative source is unverified or does not support this evidence type.", stale_source: "The source is expired, future-dated or needs review.", conflicting_rules: "Equally applicable current records disagree.", pending_supersession: "A proposed replacement rule has not been sufficiently verified.", unsupported_units: "Only explicitly recorded km/h limits are supported.", too_many_candidates: "Too many nearby roads to establish a reliable match.", too_many_rules: "Too many applicable records to evaluate safely.", service_unavailable: "Verified speed-limit data is temporarily unavailable.",
} as const;
export type SpeedUnknownReason = keyof typeof reasons;
export const unknownSpeedLimit = (reason: SpeedUnknownReason) => ({ status: "unknown" as const, speedLimitKmh: null, units: "km/h" as const, reason, message: reasons[reason] });
const day = 86400000;
const parsed = (value: string | null) => value === null ? NaN : Date.parse(value);
const current = (from: string | null, until: string | null, now: number) => (from === null || (Number.isFinite(parsed(from)) && parsed(from) <= now)) && (until === null || (Number.isFinite(parsed(until)) && parsed(until) > now));
const fresh = (date: string | null, days: number, now: number) => Number.isFinite(parsed(date)) && parsed(date) <= now + 2000 && now - parsed(date) <= days * day;
const angle = (a: number, b: number) => Math.abs((a - b + 540) % 360 - 180);
function sourceProblem(source: SafetySource | null, now: number): SpeedUnknownReason | null {
  if (!source || source.synthetic || !["approved", "published"].includes(source.status) || !source.document?.trim()) return "unverified_source";
  if (!current(source.validFrom, source.expiresAt, now) || !fresh(source.reviewedAt, 365, now)) return "stale_source";
  return null;
}
export function gpsProblem(fix: SafetyFix, now: number): SpeedUnknownReason | null {
  if (fix.timestamp === undefined) return "timestamp_required";
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > 10000) return "stale_gps";
  if (fix.timestamp > now + 2000) return "future_gps";
  if (!Number.isFinite(fix.accuracy) || fix.accuracy <= 0 || fix.accuracy > 25) return "poor_gps_accuracy";
  if (fix.heading === undefined || !Number.isFinite(fix.heading) || fix.heading < 0 || fix.heading >= 360) return "heading_required";
  return null;
}
export function ruleProblem(rule: SafetyRule, now: number): SpeedUnknownReason | null {
  if (rule.synthetic || rule.status !== "published" || rule.legalApplicability !== "confirmed" || rule.approvals < 2 || !rule.auditLogId || !rule.reference?.trim() || !Number.isInteger(rule.speedLimitKmh) || rule.speedLimitKmh! < 1 || rule.speedLimitKmh! > 200) return "unverified_rule";
  if (rule.units !== "km/h") return "unsupported_units";
  if (rule.confidence === null || !Number.isFinite(rule.confidence) || rule.confidence < 0.9 || rule.confidence > 1) return "low_confidence_rule";
  if (!fresh(rule.lastReviewedAt, 180, now) || !fresh(rule.oldestApprovalAt, 180, now)) return "stale_rule";
  const source = sourceProblem(rule.source, now); if (source) return source;
  if (rule.evidenceType === "posted_signage" ? !["official", "field_audit"].includes(rule.source!.kind) : !["official_record", "general_default"].includes(rule.evidenceType) || rule.source!.kind !== "official") return "unverified_source";
  return null;
}
function publicSourceUrl(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && ![...url.searchParams.keys()].some((key) => /token|api.?key|signature|secret/i.test(key)) ? url.href : null; } catch { return null; }
}
export function evaluateSpeedLimit(fix: SafetyFix, candidates: RoadCandidate[], now: number) {
  const gps = gpsProblem(fix, now); if (gps) return unknownSpeedLimit(gps);
  if (candidates.length >= 17) return unknownSpeedLimit("too_many_candidates");
  const corridor = (r: RoadCandidate) => 2 * fix.accuracy + Math.max(0, r.accuracyMeters ?? 30) + (r.roadWidthMeters ?? 60) / 2;
  const roads = candidates.filter((r) => !r.synthetic && !r.source?.synthetic && Number.isFinite(r.distanceMeters) && r.distanceMeters >= 0 && r.distanceMeters <= corridor(r)).sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
  const road = roads[0]; if (!road) return unknownSpeedLimit("no_road_match");
  const rival = roads[1];
  if (rival) {
    if (road.gradeLevel !== null && rival.gradeLevel !== null && road.gradeLevel !== rival.gradeLevel) return unknownSpeedLimit("ambiguous_levels");
    const difference = road.bearing === null || rival.bearing === null ? 90 : Math.min(angle(road.bearing, rival.bearing), angle(road.bearing, (rival.bearing + 180) % 360));
    return unknownSpeedLimit(difference > 35 || Math.min(road.endpointMeters, rival.endpointMeters) < 20 ? "ambiguous_junction" : "ambiguous_parallel_roads");
  }
  if (road.endpointMeters <= Math.max(10, corridor(road))) return unknownSpeedLimit("near_segment_boundary");
  if (road.bearing === null || !Number.isFinite(road.bearing)) return unknownSpeedLimit("heading_mismatch");
  const forward = angle(fix.heading!, road.bearing); const reverse = angle(fix.heading!, (road.bearing + 180) % 360);
  const direction = forward <= 35 && road.direction !== "reverse" ? "forward" : reverse <= 35 && road.direction !== "forward" ? "reverse" : null;
  if (!direction) return unknownSpeedLimit("heading_mismatch");
  if (road.status !== "published" || road.roadKind === "unknown" || !current(road.validFrom, road.expiresAt, now)) return unknownSpeedLimit("unverified_segment");
  if (road.confidence === null || !Number.isFinite(road.confidence) || road.confidence < 0.9 || road.confidence > 1 || road.accuracyMeters === null || !Number.isFinite(road.accuracyMeters) || road.accuracyMeters > 10 || road.accuracyMeters < 0 || road.roadWidthMeters === null || !Number.isFinite(road.roadWidthMeters) || road.roadWidthMeters < 1 || road.roadWidthMeters > 60) return unknownSpeedLimit("low_confidence_segment");
  if (!fresh(road.lastReviewedAt, 365, now)) return unknownSpeedLimit("stale_segment");
  const roadSource = sourceProblem(road.source, now); if (roadSource) return unknownSpeedLimit(roadSource);
  if (road.rules.length >= 17) return unknownSpeedLimit("too_many_rules");
  let rules = road.rules.filter((r) => !r.synthetic && (r.vehicleClass === fix.vehicleType || r.vehicleClass === "all") && (r.direction === "both" || r.direction === direction) && r.effectiveFrom !== null && current(r.effectiveFrom, r.expiresAt, now));
  if (!rules.length) return unknownSpeedLimit("no_applicable_rule");
  for (const replacement of rules) if (replacement.supersedesId && rules.some((r) => r.id === replacement.supersedesId) && ruleProblem(replacement, now)) return unknownSpeedLimit("pending_supersession");
  const superseded = new Set(rules.filter((r) => !ruleProblem(r, now)).map((r) => r.supersedesId));
  rules = rules.filter((r) => !superseded.has(r.id));
  const tier: Record<string, number> = { posted_signage: 3, official_record: 2, general_default: 1 };
  const roadRules = rules.filter((r) => r.role === "road_limit");
  const rank = (r: SafetyRule) => (tier[r.evidenceType] ?? 0) * 2 + (r.vehicleClass === fix.vehicleType ? 1 : 0);
  const highest = Math.max(...roadRules.map(rank));
  const top = roadRules.filter((r) => rank(r) === highest);
  if (!top.length) return unknownSpeedLimit("no_applicable_rule");
  for (const rule of top) { const issue = ruleProblem(rule, now); if (issue) return unknownSpeedLimit(issue); }
  if (new Set(top.map((r) => r.speedLimitKmh)).size !== 1) return unknownSpeedLimit("conflicting_rules");
  top.sort((a, b) => parsed(b.lastReviewedAt) - parsed(a.lastReviewedAt) || a.id.localeCompare(b.id));
  const caps = rules.filter((r) => r.role === "vehicle_cap");
  for (const cap of caps) { const issue = ruleProblem(cap, now); if (issue) return unknownSpeedLimit(issue); }
  const contributing = [top[0], ...caps];
  return { status: "verified" as const, speedLimitKmh: Math.min(...contributing.map((r) => r.speedLimitKmh!)), units: "km/h" as const, segmentId: road.id, vehicleType: fix.vehicleType,
    confidence: Math.min(road.confidence, ...contributing.map((r) => r.confidence!)), matchedDistanceMeters: road.distanceMeters,
    rules: contributing.map((r) => ({ ruleId: r.id, revision: r.revision, speedLimitKmh: r.speedLimitKmh, role: r.role, evidenceType: r.evidenceType, effectiveFrom: r.effectiveFrom, expiresAt: r.expiresAt, lastReviewedAt: r.lastReviewedAt, oldestIndependentReviewAt: r.oldestApprovalAt, independentApprovals: r.approvals, auditLogId: r.auditLogId, source: { id: r.source!.id, document: r.source!.document, reference: r.reference, url: publicSourceUrl(r.source!.url) } })) };
}
