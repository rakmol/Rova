import {pilotSegmentEnabled} from './pilot.js';
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ComplianceContext, ComplianceCoordinate, ComplianceNotice } from "@rova/shared";
import { course, headingDifference, metres, projectOnPath } from "./compliance-geometry.js";
import { evaluateSpeedLimit, gpsProblem, type RoadCandidate, type SafetyFix } from "./speed-limit.js";
import { validateInput } from "./validation.js";
import { reportedRoadContext } from "./reported-roads.js";
const coordinate = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export const complianceBody = z.object({
  fix: z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180), accuracy: z.number().finite().min(0).max(10000), heading: z.number().finite().min(0).lt(360).optional(), timestamp: z.number().int().safe(), vehicleType: z.enum(["private_car", "taxi", "motorcycle", "commercial_vehicle", "bus", "heavy_vehicle"]) }).strict(),
  path: z.array(coordinate).min(2).max(128),
}).strict();
export interface ComplianceCandidate {
  id: string; revision: number; kind: "transition" | "corridor"; geometry: { coordinates: ComplianceCoordinate[] };
  targetSegmentId: string; targetRuleId: string | null; targetRuleRevision: number | null;
  enforcementType: ComplianceNotice["enforcementType"]; confidence: number; accuracyMeters: number;
  effectiveFrom: string; expiresAt: string; reviewedAt: string; sourceReference: string;
  probe: ComplianceCoordinate; probeHeading: number;
}
export function noticeOnRoute(event: ComplianceCandidate, path: ComplianceCoordinate[], position: NonNullable<ReturnType<typeof projectOnPath>>, fix: SafetyFix, now: number): ComplianceNotice | null {
  if (event.confidence < 0.95 || !Number.isFinite(event.confidence) || event.confidence > 1 || event.accuracyMeters < 0 || event.accuracyMeters > 10 || !event.sourceReference.trim()
    || Date.parse(event.effectiveFrom) > now || !(Date.parse(event.expiresAt) > now) || !(Date.parse(event.reviewedAt) >= now - 180 * 86400000) || Date.parse(event.reviewedAt) > now + 2000) return null;
  const coordinates = event.geometry.coordinates; if (coordinates.length < 2) return null;
  const entry = projectOnPath(coordinates[0], path), exit = projectOnPath(coordinates.at(-1)!, path);
  // A short traversal sample must follow the selected route, not a nearby parallel road/branch.
  let traversed = 0; let probe = coordinates[0];
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i], length = metres(a, b);
    if (traversed + length >= 30) { const t = (30 - traversed) / length; probe = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; traversed = 30; break; }
    traversed += length; probe = b;
  }
  const near = projectOnPath(probe, path);
  if (!entry || !near || entry.ambiguous || near.ambiguous || entry.distance > 5 || near.distance > 5 || near.along - entry.along < 20
    || headingDifference(entry.heading, course(coordinates[0], probe)) > 30) return null;
  const distanceMeters = entry.along - position.along;
  if (distanceMeters < -80 || distanceMeters > 500 || (distanceMeters > 0 && distanceMeters < fix.accuracy * 2 + event.accuracyMeters)) return null;
  // Do not announce a turn-around/behind event even when the route loops back later.
  if (distanceMeters > 0 && headingDifference(fix.heading!, course([fix.lon, fix.lat], coordinates[0])) > 60) return null;
  return { id: event.id, revision: event.revision, kind: event.kind, distanceMeters,
    exitDistanceMeters: exit && !exit.ambiguous && exit.distance <= 5 && exit.along >= entry.along ? exit.along - position.along : distanceMeters + traversed,
    speedLimitKmh: null, enforcementType: event.enforcementType, confidence: event.confidence, effectiveFrom: event.effectiveFrom,
    expiresAt: event.expiresAt, reviewedAt: event.reviewedAt, sourceReference: event.sourceReference, demo: false };
}
export function registerComplianceRoute(app: FastifyInstance, database: Pool, flags: { enabled: boolean; transitions: boolean; corridors: boolean; reportedRoads?: boolean;pilotRestricted?:boolean }, clock: () => number = Date.now) {
  app.post("/safety/alert-context", { logLevel: "silent", bodyLimit: 32768, config: { rateLimit: { max: 40, timeWindow: 60000 } } }, async (request, reply) => {
    validateInput(complianceBody, request.body); const { fix, path } = complianceBody.parse(request.body);
    const empty = (reason: string): ComplianceContext => ({ fixTimestamp: fix.timestamp, checkedAt: clock(), validUntil: clock(), coordinate: [fix.lon, fix.lat], validForMeters: 0, limit: { status: "unknown", speedLimitKmh: null, reason }, notices: [], enforcementStatus: "unavailable/unverified" });
    if (!flags.enabled) return empty("feature_disabled");
    const issue = gpsProblem(fix, clock()); if (issue) return empty(issue);
    const position = projectOnPath([fix.lon, fix.lat], path);
    const length = path.slice(1).reduce((sum, point, i) => sum + metres(path[i], point), 0);
    if (!position || position.ambiguous || position.distance > Math.min(15, fix.accuracy * 2) || headingDifference(position.heading, fix.heading!) > 30 || length > 1500) return empty("route_alignment_unknown");
    const reportedRoads = await reportedRoadContext(database, fix, path, position.along, clock(), flags.reportedRoads === true&&!flags.pilotRestricted);
    const lookup = async (point: SafetyFix) => { const rows = await database.query<{ candidate: RoadCandidate }>("SELECT candidate FROM public.rova_speed_limit_candidates($1,$2,$3,$4) AS candidates(candidate)", [point.lon, point.lat, 100, point.vehicleType]); return rows.rows.map((r) => r.candidate); };
    try {
      const roads = await lookup(fix); const limit = evaluateSpeedLimit(fix, roads, clock());
      if (limit.status !== "verified") return { ...empty(limit.reason), limit, reportedRoads };
      if(flags.pilotRestricted&&!await pilotSegmentEnabled(database,limit.segmentId))return empty('pilot_corridor_unavailable');
      const rows = await database.query<{ candidate: ComplianceCandidate }>("SELECT candidate FROM public.rova_compliance_candidates($1,$2,$3) AS events(candidate)", [fix.lon, fix.lat, limit.segmentId]);
      const notices: ComplianceNotice[] = [];
      if (rows.rows.length < 17) for (const { candidate } of rows.rows) {
        if (candidate.kind === "transition" ? !flags.transitions : !flags.corridors) continue;
        if(flags.pilotRestricted&&!await pilotSegmentEnabled(database,candidate.targetSegmentId))continue;
        const notice = noticeOnRoute(candidate, path, position, fix, clock()); if (!notice) continue;
        if (candidate.kind === "transition") {
          // Virtual target-road inspection, never exposed as a current GPS measurement.
          const target = { ...fix, lon: candidate.probe[0], lat: candidate.probe[1], heading: candidate.probeHeading };
          const targetRoads = await lookup(target);
          const proof = evaluateSpeedLimit(target, targetRoads, clock());
          if (proof.status !== "verified" || proof.segmentId !== candidate.targetSegmentId || !proof.rules.some((r) => r.ruleId === candidate.targetRuleId && r.revision === candidate.targetRuleRevision)) continue;
          if (proof.speedLimitKmh === limit.speedLimitKmh) continue;
          notice.speedLimitKmh = proof.speedLimitKmh;
          const checkedAt = clock();
          const targetRoad = targetRoads.find((r) => r.id === proof.segmentId)!;
          const expirations = [notice.expiresAt, targetRoad.expiresAt, targetRoad.source?.expiresAt, ...targetRoad.rules.flatMap((r) => [r.expiresAt, r.source?.expiresAt, r.effectiveFrom])]
            .map((date) => date ? Date.parse(date) : NaN).filter((date) => Number.isFinite(date) && date > checkedAt);
          notice.expiresAt = new Date(Math.min(checkedAt + 3000, ...expirations)).toISOString();
        }
        notices.push(notice);
      }
      const stale = gpsProblem(fix, clock()); if (stale) return empty(stale);
      const finalLimit = evaluateSpeedLimit(fix, roads, clock()); if (finalLimit.status !== "verified") return { ...empty(finalLimit.reason), limit: finalLimit, reportedRoads };
      if(flags.pilotRestricted&&!await pilotSegmentEnabled(database,limit.segmentId))return empty('pilot_corridor_unavailable');
      const matched = roads.find((r) => r.id === limit.segmentId)!;
      const validForMeters = Math.max(0, Math.min(20, matched.endpointMeters - (2 * fix.accuracy + (matched.accuracyMeters ?? 30) + (matched.roadWidthMeters ?? 60) / 2)));
      const checkedAt = clock();
      const deadlines = [matched.expiresAt, matched.source?.expiresAt, ...matched.rules.flatMap((r) => [r.expiresAt, r.source?.expiresAt, r.effectiveFrom])]
        .map((date) => date ? Date.parse(date) : NaN).filter((date) => Number.isFinite(date) && date > checkedAt);
      const validUntil = Math.min(checkedAt + 3000, ...deadlines);
      return { fixTimestamp: fix.timestamp, checkedAt, validUntil, coordinate: [fix.lon, fix.lat], validForMeters, limit, notices, reportedRoads,
        enforcementStatus: notices.some((e) => e.kind === "corridor") ? "verified_corridor" : "unavailable/unverified" } satisfies ComplianceContext;
    } catch { app.log.warn({ dependency: "compliance-data", requestId: request.id }, "Compliance data unavailable"); return reply.code(503).send(empty("service_unavailable")); }
  });
}
