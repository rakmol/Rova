import Constants from "expo-constants";
import type { ComplianceContext, ComplianceCoordinate, VehicleClass } from "@rova/shared";
import type { Fix } from "./session";
const host = Constants.expoConfig?.hostUri;
const tunnel = __DEV__ && typeof host === "string" && [".on.expo.app", ".exp.direct", ".ngrok-free.app"].some((suffix) => host.endsWith(suffix)) ? `https://${host}/rova-api/safety/alert-context` : undefined;
export const complianceEndpoint = process.env.EXPO_PUBLIC_COMPLIANCE_API_URL || tunnel;
export async function fetchComplianceContext(fix: Fix, path: ComplianceCoordinate[], signal: AbortSignal, vehicleType: VehicleClass = "private_car", endpoint = complianceEndpoint): Promise<ComplianceContext> {
  if (!endpoint) throw new Error("Compliance data unavailable/unverified");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Compliance endpoint requires HTTPS");
  const response = await fetch(url.toString(), { method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ fix: { lon: fix.coordinate[0], lat: fix.coordinate[1], accuracy: fix.accuracy, heading: fix.heading ?? undefined, timestamp: fix.timestamp, vehicleType }, path }) });
  if (!response.ok) throw new Error("Compliance data unavailable/unverified");
  const data = await response.json() as ComplianceContext;
  if (data.fixTimestamp !== fix.timestamp || !Number.isFinite(data.checkedAt) || !Number.isFinite(data.validUntil) || data.validUntil > data.checkedAt + 3000 || !Array.isArray(data.coordinate) || data.coordinate.length !== 2 || data.coordinate.some((n, i) => n !== fix.coordinate[i])
    || !Number.isFinite(data.validForMeters) || data.validForMeters < 0 || data.validForMeters > 20 || !Array.isArray(data.notices) || data.notices.length > 16
    || !["verified_corridor", "unavailable/unverified"].includes(data.enforcementStatus)
    || !data.limit || !["verified", "unknown"].includes(data.limit.status)) throw new Error("Invalid compliance response");
  if (data.limit.status === "verified" && (data.limit.units !== "km/h" || !data.limit.segmentId || !Number.isFinite(data.limit.confidence) || !Number.isInteger(data.limit.speedLimitKmh))) throw new Error("Invalid limit evidence");
  for (const n of data.notices) if (!n || typeof n.id !== "string" || !Number.isInteger(n.revision) || n.revision < 1 || !["transition", "corridor"].includes(n.kind) || n.demo !== false
    || !Number.isFinite(n.distanceMeters) || n.distanceMeters < -80 || n.distanceMeters > 500 || !Number.isFinite(n.exitDistanceMeters) || n.exitDistanceMeters < n.distanceMeters
    || !Number.isFinite(n.confidence) || typeof n.sourceReference !== "string" || ![n.reviewedAt, n.effectiveFrom, n.expiresAt].every((d) => typeof d === "string" && Number.isFinite(Date.parse(d)))
    || !["fixed_speed", "average_speed", "red_light", "combined", "checkpoint", "unknown"].includes(n.enforcementType)) throw new Error("Invalid compliance notice");
  const reports=data.reportedRoads;
  if(reports){
    if(!['available','unavailable','disabled'].includes(reports.status)||!Number.isFinite(reports.validUntil)||reports.validUntil>data.checkedAt+5000||!Array.isArray(reports.notices)||reports.notices.length>8)throw new Error('Invalid reported-road context');
    for(const n of reports.notices)if(!n||typeof n.id!=='string'||!n.id||typeof n.roadName!=='string'||!n.roadName||n.roadName.length>200||n.verification!=='unverified'||n.scope!=='named_road_not_camera'
      ||!Number.isFinite(n.distanceMeters)||n.distanceMeters<0||n.distanceMeters>500||!Number.isFinite(n.exitDistanceMeters)||n.exitDistanceMeters<n.distanceMeters||n.exitDistanceMeters>600
      ||typeof n.sourceUrl!=='string'||!n.sourceUrl.startsWith('https://')||!Number.isFinite(Date.parse(n.reportedAt)))throw new Error('Invalid unverified road notice');
  }
  return data;
}
