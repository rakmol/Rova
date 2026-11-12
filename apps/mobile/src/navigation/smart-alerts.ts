import {tx} from "../i18n";
import type { ComplianceContext, ComplianceNotice } from "@rova/shared";
import { headingDifference, metres } from "@rova/shared";
import type { Fix } from "./session";
export type SmartAlertFlags = { enabled: boolean; transitions: boolean; corridors: boolean };
export const smartAlertFlags: SmartAlertFlags = {
  enabled: process.env.EXPO_PUBLIC_COMPLIANCE_ALERTS_ENABLED !== "false",
  transitions: process.env.EXPO_PUBLIC_COMPLIANCE_TRANSITIONS_ENABLED !== "false",
  corridors: process.env.EXPO_PUBLIC_COMPLIANCE_CORRIDORS_ENABLED !== "false",
};
export type BoundComplianceContext = { data: ComplianceContext; progressMeters: number; heading: number };
export interface SmartAlertSnapshot {
  state: "unavailable" | "monitoring" | "pending" | "overspeed"; limitKmh: number | null;
  enforcementStatus: ComplianceContext["enforcementStatus"]; upcoming: ComplianceNotice | null;
  alert: { id: string; kind: "overspeed" | "transition" | "corridor"; text: string } | null;
}
export const emptySmartAlert = (): SmartAlertSnapshot => ({ state: "unavailable", limitKmh: null, enforcementStatus: "unavailable/unverified", upcoming: null, alert: null });
export class SmartAlertEngine {
  private lastTimestamp = -Infinity;
  private lastSample = -Infinity;
  private since: number | null = null;
  private samples = 0;
  private over = false;
  private limitKey = "";
  private lastOverspeed = -Infinity;
  private lastAlert = -Infinity;
  private zones = new Map<string, { phase: "ahead" | "inside" | "passed"; alerted: boolean }>();
  private resetSpeed() { this.since = null; this.samples = 0; this.over = false; this.limitKey = ""; this.lastSample = -Infinity; }
  update(input: { fix: Fix | null; speedKmh: number | null; reliable: boolean; navigating: boolean; progressMeters: number; context: BoundComplianceContext | null; now: number; flags: SmartAlertFlags; suppressPrompt?: boolean }): SmartAlertSnapshot {
    const { fix, context, now, flags, speedKmh } = input; const unavailable = emptySmartAlert();
    const data = context?.data;
    const delta = context ? input.progressMeters - context.progressMeters : Infinity;
    const reliable = flags.enabled && input.navigating && input.reliable && fix && fix.accuracy !== null && fix.accuracy > 0 && fix.accuracy <= 25
      && now - fix.timestamp <= 3000 && fix.timestamp <= now + 1000 && fix.heading !== null && Number.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360
      && data && data.limit.status === "verified" && data.limit.confidence >= 0.9 && data.limit.confidence <= 1 && Number.isInteger(data.limit.speedLimitKmh) && data.limit.speedLimitKmh > 0 && data.limit.speedLimitKmh <= 200
      && data.checkedAt <= now + 1000 && now - data.checkedAt <= 3000 && now < data.validUntil && fix.timestamp >= data.fixTimestamp && now - data.fixTimestamp <= 5000
      && delta >= -3 && delta <= data.validForMeters && metres(fix.coordinate, data.coordinate) <= data.validForMeters && headingDifference(fix.heading, context!.heading) <= 15;
    if (!reliable || !data || !fix || data.limit.status !== "verified") {
      // A new fix can outgrow a proof's movement bound while its replacement is
      // in flight. Show unavailable and emit nothing, but allow successive
      // independently verified fixes <=2.5 seconds apart to sustain the timer.
      const awaitingProof = flags.enabled && input.navigating && input.reliable && fix && data?.limit.status === "verified"
        && fix.accuracy !== null && fix.accuracy > 0 && fix.accuracy <= 25 && now - fix.timestamp <= 3000 && fix.timestamp <= now + 1000
        && fix.heading !== null && Number.isFinite(fix.heading) && headingDifference(fix.heading, context!.heading) <= 15
        && speedKmh !== null && Number.isFinite(speedKmh) && speedKmh >= 0 && speedKmh <= 216
        && data.checkedAt <= now + 1000 && now - data.checkedAt <= 3000 && data.validUntil > now && now - this.lastSample <= 2500;
      if (!awaitingProof) this.resetSpeed();
      return unavailable;
    }
    const limit = data.limit.speedLimitKmh;
    const result: SmartAlertSnapshot = { ...unavailable, state: "monitoring", limitKmh: limit };
    const fresh = fix.timestamp > this.lastTimestamp;
    if (fresh) {
      const key = `${data.limit.segmentId}:${limit}`;
      if (key !== this.limitKey || fix.timestamp - this.lastSample > 2500) this.resetSpeed();
      this.limitKey = key; this.lastTimestamp = fix.timestamp; this.lastSample = fix.timestamp;
      if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > 216 || speedKmh <= limit + 1) { this.since = null; this.samples = 0; this.over = false; }
      else if (speedKmh > limit + Math.max(3, limit * 0.05)) {
        this.since ??= fix.timestamp; this.samples++;
        if (fix.timestamp - this.since >= 5000 && this.samples >= 3) this.over = true;
      } else if (!this.over) { this.since = null; this.samples = 0; }
    }
    result.state = this.over ? "overspeed" : this.since === null ? "monitoring" : "pending";
    const eligible = data.notices.filter((n) => n.demo === false && n.confidence >= 0.95 && n.confidence <= 1 && n.sourceReference.trim()
      && Date.parse(n.effectiveFrom) <= now && Date.parse(n.expiresAt) > now && Date.parse(n.reviewedAt) <= now + 2000 && Date.parse(n.reviewedAt) >= now - 180 * 86400000
      && (n.kind === "transition" ? flags.transitions && Number.isInteger(n.speedLimitKmh) && n.speedLimitKmh! > 0 && n.speedLimitKmh! <= 200 : flags.corridors))
      .map((n) => ({ ...n, distanceMeters: n.distanceMeters - delta, exitDistanceMeters: n.exitDistanceMeters - delta })).sort((a, b) => a.distanceMeters - b.distanceMeters);
    result.enforcementStatus = eligible.some((n) => n.kind === "corridor" && n.exitDistanceMeters >= -20) ? "verified_corridor" : "unavailable/unverified";
    result.upcoming = eligible.find((n) => n.distanceMeters >= 0 && n.distanceMeters <= 500) ?? null;
    const emit = (id: string, kind: NonNullable<SmartAlertSnapshot["alert"]>["kind"], text: string) => {
      if (!fresh || input.suppressPrompt || now - this.lastAlert < 12000) return false;
      result.alert = { id, kind, text }; this.lastAlert = now; return true;
    };
    if (this.over && now - this.lastOverspeed >= 30000 && emit(`overspeed:${this.limitKey}:${fix.timestamp}`, "overspeed", tx('voice.slowDown'))) this.lastOverspeed = now;
    for (const n of eligible) {
      const key = `${n.kind}:${n.id}:${n.revision}`;
      const prior = this.zones.get(key);
      // Spatial hysteresis prevents boundary jitter from repeatedly entering/exiting a corridor.
      let phase = prior?.phase ?? "ahead";
      if (n.exitDistanceMeters < -20) phase = "passed";
      else if (n.distanceMeters < -20 && phase !== "passed") phase = "inside";
      const memory = { phase, alerted: prior?.alerted ?? false };
      this.zones.set(key, memory);
      if (memory.alerted || phase !== "ahead" || n.distanceMeters < 30 || n.distanceMeters > 400) continue;
      const text = n.kind === "transition" ? tx('voice.limitAhead',{speed:n.speedLimitKmh!}) : tx('voice.corridor');
      if (emit(key, n.kind, text)) memory.alerted = true;
    }
    // Bound session-only memory. No positions or alert history are persisted.
    if (this.zones.size > 512) { const oldest = this.zones.keys().next().value; if (oldest) this.zones.delete(oldest); }
    return result;
  }
}
