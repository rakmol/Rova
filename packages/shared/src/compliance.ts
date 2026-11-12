export type ComplianceCoordinate = [number, number];
export type EnforcementType = "fixed_speed" | "average_speed" | "red_light" | "combined" | "checkpoint" | "unknown";
export interface ReportedRoadNotice {
  id: string; roadName: string; verification: "unverified"; scope: "named_road_not_camera";
  distanceMeters: number; exitDistanceMeters: number; sourceUrl: string; reportedAt: string;
}
export interface ReportedRoadContext {
  status: "available" | "unavailable" | "disabled"; validUntil: number; notices: ReportedRoadNotice[];
}
export interface ComplianceNotice {
  id: string; revision: number; kind: "transition" | "corridor"; distanceMeters: number; exitDistanceMeters: number;
  speedLimitKmh: number | null; enforcementType: EnforcementType; confidence: number;
  effectiveFrom: string; expiresAt: string; reviewedAt: string; sourceReference: string; demo: false;
}
export interface ComplianceContext {
  fixTimestamp: number; checkedAt: number; validUntil: number; coordinate: ComplianceCoordinate; validForMeters: number;
  limit: { status: "verified"; speedLimitKmh: number; segmentId: string; confidence: number; units: "km/h" } | { status: "unknown"; speedLimitKmh: null; reason: string };
  notices: ComplianceNotice[];
  enforcementStatus: "verified_corridor" | "unavailable/unverified";
  reportedRoads?: ReportedRoadContext;
}
export const metres = (a: ComplianceCoordinate, b: ComplianceCoordinate) => {
  const rad = Math.PI / 180; const dlat = (b[1] - a[1]) * rad; const dlon = (b[0] - a[0]) * rad;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2)));
};
export const headingDifference = (a: number, b: number) => Math.abs((a - b + 540) % 360 - 180);
export const course = (a: ComplianceCoordinate, b: ComplianceCoordinate) => {
  const r = Math.PI / 180; const dl = (b[0] - a[0]) * r;
  return (Math.atan2(Math.sin(dl) * Math.cos(b[1] * r), Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos(dl)) / r + 360) % 360;
};
export function projectOnPath(point: ComplianceCoordinate, path: ComplianceCoordinate[]) {
  let along = 0; let best: { along: number; distance: number; heading: number; coordinate: ComplianceCoordinate } | null = null;
  const alternatives: { along: number; distance: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = metres(a, b); if (length < 0.1) continue;
    const scale = Math.cos(point[1] * Math.PI / 180); const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * scale * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    const coordinate: ComplianceCoordinate = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const distance = metres(point, coordinate); const candidate = { along: along + t * length, distance, heading: course(a, b), coordinate };
    alternatives.push(candidate); if (!best || distance < best.distance) best = candidate; along += length;
  }
  if (!best) return null;
  return { ...best, ambiguous: alternatives.some((p) => Math.abs(p.along - best!.along) > 40 && p.distance <= best!.distance + 10) };
}
/** Keep original route vertices; never simplify across a turn. No route history is persisted. */
export function routeWindow(path: ComplianceCoordinate[], progress: number, behind = 80, ahead = 650): ComplianceCoordinate[] {
  let along = 0; const result: ComplianceCoordinate[] = []; const from = Math.max(0, progress - behind), to = progress + ahead;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = metres(a, b), end = along + length;
    if (length > 0 && end >= from && along <= to) {
      const at = (m: number): ComplianceCoordinate => { const t = Math.max(0, Math.min(1, (m - along) / length)); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
      if (!result.length) result.push(at(from)); result.push(at(Math.min(to, end)));
    }
    along = end; if (along >= to) break;
  }
  return result.length <= 128 ? result : []; // Dense geometry is unavailable, never silently truncated/simplified.
}
