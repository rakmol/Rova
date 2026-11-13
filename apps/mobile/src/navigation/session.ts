import {tx} from "../i18n";
import type { RoutingCoordinate, RoutingOption } from "@rova/shared";

export type NavigationState = "idle" | "previewing" | "navigating" | "off-route" | "rerouting" | "arrived" | "paused" | "error";
export type Fix = { coordinate: RoutingCoordinate; accuracy: number | null; timestamp: number; heading: number | null; speed: number | null };
export type Progress = { along: number; remainingMeters: number; remainingSeconds: number; instruction: string | null; turnMeters: number | null; step: number; coordinate: RoutingCoordinate };
export type SessionSnapshot = { state: NavigationState; route: RoutingOption | null; progress: Progress | null; gpsReliable: boolean; message: string; speedKmh: number | null };
const radians = (n: number) => n * Math.PI / 180;
export function distance(a: RoutingCoordinate, b: RoutingCoordinate) {
  const dLat = radians(b[1] - a[1]); const dLon = radians(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[1])) * Math.cos(radians(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
function bearing(a: RoutingCoordinate, b: RoutingCoordinate) {
  const dLon = radians(b[0] - a[0]);
  return (Math.atan2(Math.sin(dLon) * Math.cos(radians(b[1])), Math.cos(radians(a[1])) * Math.sin(radians(b[1])) - Math.sin(radians(a[1])) * Math.cos(radians(b[1])) * Math.cos(dLon)) * 180 / Math.PI + 360) % 360;
}
const angleDifference = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

export class NavigationMachine {
  snapshot: SessionSnapshot = { state: "idle", route: null, progress: null, gpsReliable: false, message: "Choose a route", speedKmh: null };
  private lengths: number[] = [];
  private previous: Fix | null = null;
  private deviatingSince: number | null = null;
  private deviationCount = 0;
  private arrivalCount = 0;
  private lastReroute = -Infinity;
  private lastAccepted = 0;
  // The last quality-checked fix is independent of route-direction confirmation.
  get locationFix(): Fix | null { return this.previous; }
  preview(route: RoutingOption) {
    if (route.isSample) throw new Error("Sample routes cannot be used for navigation.");
    if (!route.maneuvers.length || route.maneuvers.some((step) => step.geometryIndex === undefined || !Number.isInteger(step.geometryIndex) || step.geometryIndex < 0 || step.geometryIndex >= route.geometry.coordinates.length)) throw new Error("This route has missing or unlocated maneuver instructions. Refresh route options before navigating.");
    this.lengths = [0];
    const points = route.geometry.coordinates;
    for (let i = 1; i < points.length; i++) this.lengths.push(this.lengths[i - 1] + distance(points[i - 1], points[i]));
    if (this.lengths.at(-1)! <= 0) throw new Error("Route geometry has no usable distance.");
    this.previous = null; this.lastAccepted = 0; this.deviationCount = 0; this.deviatingSince = null; this.arrivalCount = 0;
    this.snapshot = { state: "previewing", route, progress: null, gpsReliable: false, message: "Ready to navigate", speedKmh: null };
  }
  start() {
    if (this.snapshot.state === "previewing") this.snapshot = { ...this.snapshot, state: "navigating", message: "Waiting for accurate GPS" };
  }
  pause() {
    if (["navigating", "off-route", "rerouting"].includes(this.snapshot.state)) this.snapshot = { ...this.snapshot, state: "paused", gpsReliable: false, speedKmh: null, message: "Paused. Resume when ready." };
  }
  resume() {
    if (this.snapshot.state !== "paused") return;
    this.previous = null; this.lastAccepted = 0; this.deviationCount = 0; this.deviatingSince = null; this.arrivalCount = 0;
    this.snapshot = { ...this.snapshot, state: "navigating", gpsReliable: false, message: "Waiting for a fresh GPS fix" };
  }
  fail(message: string) { this.snapshot = { ...this.snapshot, state: "error", gpsReliable: false, speedKmh: null, message }; }
  stop() { this.snapshot = { ...this.snapshot, state: "idle", gpsReliable: false, speedKmh: null, message: "Navigation ended" }; }
  stale(now: number) {
    if (["navigating", "off-route", "rerouting"].includes(this.snapshot.state) && (!this.lastAccepted || now - this.lastAccepted > 10000)) {
      this.snapshot = { ...this.snapshot, gpsReliable: false, speedKmh: null, message: "Waiting for a GPS update. Your route remains available." };
      this.deviationCount = 0; this.deviatingSince = null; this.arrivalCount = 0;
    }
  }
  beginReroute(now: number) {
    if (this.snapshot.state !== "off-route" || !this.snapshot.gpsReliable || now - this.lastReroute < 30000) return false;
    this.lastReroute = now;
    this.snapshot = { ...this.snapshot, state: "rerouting", message: "Recalculating route. Follow road signs safely." };
    return true;
  }
  rerouteFailed() {
    if (this.snapshot.state === "rerouting") this.snapshot = { ...this.snapshot, state: "off-route", message: "Route recalculation failed. Check connection; retry is limited to once every 30 seconds." };
  }
  update(fix: Fix, now: number) {
    const { state, route } = this.snapshot;
    if (!route || !["navigating", "off-route", "rerouting"].includes(state)) return;
    const [lon, lat] = fix.coordinate;
    const usable = Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 && fix.accuracy !== null && Number.isFinite(fix.accuracy) && fix.accuracy >= 0 && fix.accuracy <= 35 && Number.isFinite(fix.timestamp) && now - fix.timestamp <= 10000 && fix.timestamp <= now + 2000;
    if (!usable) {
      this.snapshot = { ...this.snapshot, gpsReliable: false, speedKmh: null, message: "Location accuracy is low. Waiting for a better GPS update." };
      this.deviationCount = 0; this.deviatingSince = null; this.arrivalCount = 0;
      return;
    }
    if (this.previous && fix.timestamp <= this.previous.timestamp) return;
    const elapsed = this.previous ? (fix.timestamp - this.previous.timestamp) / 1000 : 0;
    const moved = this.previous ? distance(this.previous.coordinate, fix.coordinate) : 0;
    if (this.previous && elapsed < 10 && moved > elapsed * 60 + 70) {
      this.snapshot = { ...this.snapshot, gpsReliable: false, speedKmh: null, message: "GPS jumped unexpectedly. Waiting for a reliable fix." };
      this.deviationCount = 0; this.deviatingSince = null; this.arrivalCount = 0;
      return;
    }
    const points = route.geometry.coordinates;
    const previousAlong = this.snapshot.progress?.along;
    const restrict = this.previous && elapsed < 10 && previousAlong !== undefined;
    let best: { cross: number; along: number; coordinate: RoutingCoordinate; bearing: number } | null = null;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]; const b = points[i + 1]; const scale = Math.cos(radians(fix.coordinate[1]));
      const dx = (b[0] - a[0]) * scale; const dy = b[1] - a[1];
      const fraction = Math.max(0, Math.min(1, (((lon - a[0]) * scale * dx + (lat - a[1]) * dy) / (dx * dx + dy * dy)) || 0));
      const along = this.lengths[i] + fraction * (this.lengths[i + 1] - this.lengths[i]);
      if (restrict && (along < previousAlong - 80 || along > previousAlong + Math.max(180, elapsed * 60))) continue;
      const coordinate: RoutingCoordinate = [a[0] + fraction * (b[0] - a[0]), a[1] + fraction * (b[1] - a[1])];
      const cross = distance(coordinate, fix.coordinate);
      if (!best || cross < best.cross) best = { along, cross, coordinate, bearing: bearing(a, b) };
    }
    if (!best) return;
    const speed = fix.speed !== null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 60 ? fix.speed : elapsed > 0 && elapsed < 10 && moved >= 8 && moved / elapsed <= 60 ? moved / elapsed : null;
    const heading = fix.heading !== null && Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 ? fix.heading : this.previous && moved >= 8 ? bearing(this.previous.coordinate, fix.coordinate) : null;
    const wrongDirection = speed !== null && speed > 3 && heading !== null && angleDifference(heading, best.bearing) > 110;
    const off = best.cross > Math.max(45, fix.accuracy! * 2) || wrongDirection;
    this.previous = fix; this.lastAccepted = fix.timestamp;
    this.snapshot = { ...this.snapshot, gpsReliable: true, speedKmh: speed === null ? null : speed * 3.6 };
    if (off) {
      this.deviationCount++; this.deviatingSince ??= fix.timestamp; this.arrivalCount = 0;
      this.snapshot = { ...this.snapshot, gpsReliable: false, message: wrongDirection ? "Direction differs from route. Checking position." : "Position differs from route. Checking GPS." };
      if (this.deviationCount >= 3 && fix.timestamp - this.deviatingSince >= 5000) this.snapshot = { ...this.snapshot, gpsReliable: true, state: state === "rerouting" ? "rerouting" : "off-route", message: wrongDirection ? "Wrong direction detected. Recalculating safely." : "Off route. Recalculation needed." };
      return;
    }
    this.deviationCount = 0; this.deviatingSince = null;
    const total = this.lengths.at(-1)!;
    const next = route.maneuvers.map((step, index) => ({ ...step, index, at: step.geometryIndex === undefined ? null : this.lengths[step.geometryIndex] })).find((step) => step.at !== null && step.at >= best!.along - 8 && step.at > 5);
    const remainingMeters = route.distanceMeters * Math.max(0, 1 - best.along / total);
    const progress: Progress = { along: best.along, coordinate: best.coordinate, remainingMeters, remainingSeconds: route.durationSeconds * Math.max(0, 1 - best.along / total), instruction: next?.instruction ?? null, turnMeters: next?.at === null || next?.at === undefined ? null : Math.max(0, next.at - best.along), step: next?.index ?? -1 };
    this.snapshot = { ...this.snapshot, progress, state: state === "rerouting" ? "rerouting" : "navigating", message: state === "rerouting" ? "Recalculating route. Guidance is suspended." : "Following route. Estimates without live traffic." };
    const nearEnd = total - best.along <= 40 && distance(fix.coordinate, points.at(-1)!) <= 25;
    this.arrivalCount = nearEnd ? this.arrivalCount + 1 : 0;
    if (this.arrivalCount >= 3) this.snapshot = { ...this.snapshot, state: "arrived", speedKmh: null, message: "You have arrived" };
  }
}

export class VoiceGate {
  private spoken = new Set<string>();
  private lastSpoken = -Infinity;
  next(snapshot: SessionSnapshot, muted: boolean, now: number): string | null {
    if (muted || !snapshot.gpsReliable || now - this.lastSpoken < 8000) return null;
    const p = snapshot.progress;
    const arrival = snapshot.state === "arrived";
    if (!arrival && (snapshot.state !== "navigating" || !p?.instruction || p.turnMeters === null || p.turnMeters > 300)) return null;
    const stage = arrival ? "arrived" : p!.turnMeters! <= 35 ? "now" : "approach";
    const key = `${snapshot.route?.id}:${arrival ? "arrived" : p!.step}:${stage}`;
    if (this.spoken.has(key)) return null;
    this.spoken.add(key); this.lastSpoken = now;
    if (arrival) return tx('voice.arrival');
    // Once the close prompt is spoken, never issue its earlier approach prompt.
    if (stage === "now") this.spoken.add(`${snapshot.route?.id}:${p!.step}:approach`);
    return stage === "now" ? p!.instruction : tx('voice.approach',{distance:Math.round(p!.turnMeters!/10)*10,instruction:p!.instruction!});
  }
}
