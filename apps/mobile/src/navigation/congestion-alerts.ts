import {tx} from "../i18n";
import { headingDifference, metres, projectOnPath, routeWindow } from '@rova/shared';
import type { RoutingCoordinate } from '@rova/shared';
import type { HazardFeedState } from '../incidents/realtime';
import type { Fix } from './session';

export interface CongestionAlert { id: string; distanceMeters: number; text: string }
export class CongestionAlertEngine {
  private seen = new Set<string>();
  private announced: RoutingCoordinate[] = [];
  private pending = new Map<string, { timestamp: number; count: number }>();
  private lastPrompt = -Infinity;
  update(input: { feed: HazardFeedState; fix: Fix | null; path: RoutingCoordinate[]; progress: number; now: number;
    navigating: boolean; suppressPrompt: boolean; audioEnabled: boolean }): { nearby: CongestionAlert | null; speak: string | null } {
    const empty = { nearby: null, speak: null };
    const { feed, fix, now } = input;
    if (!input.navigating || !fix || fix.accuracy === null || fix.accuracy <= 0 || fix.accuracy > 25 || !Number.isFinite(fix.accuracy)
      || now - fix.timestamp > 3000 || fix.timestamp > now + 1000 || !Number.isFinite(fix.timestamp) || !fix.coordinate.every(Number.isFinite)
      || fix.heading === null || !Number.isFinite(fix.heading) || fix.heading < 0 || fix.heading >= 360
      || feed.stale || feed.checkedAt === null || now - feed.checkedAt > 30000 || feed.checkedAt > now + 1000) { this.pending.clear(); return empty; }
    const path = routeWindow(input.path, input.progress, 80, 1000);
    const current = projectOnPath(fix.coordinate, path);
    if (!current || current.ambiguous || current.distance > 25 || headingDifference(fix.heading, current.heading) > 40) { this.pending.clear(); return empty; }
    const candidates = feed.reports.flatMap(report => {
      if (report.category !== 'congestion' || report.status !== 'verified' || report.evidence !== 'community' || report.authorityVerified !== false
        || Date.parse(report.expiresAt) <= now || !Number.isFinite(Date.parse(report.expiresAt)) || now - Date.parse(report.reportedAt) > 1800000
        || !Number.isFinite(Date.parse(report.reportedAt)) || Date.parse(report.reportedAt) > now + 1000
        || report.approximateRadiusMeters !== 150) return [];
      const match = projectOnPath(report.coordinate, path);
      if (!match || match.ambiguous || match.distance > 150) return [];
      const ahead = match.along - current.along;
      return ahead >= 100 && ahead <= 800 ? [{ report, ahead }] : [];
    }).sort((a, b) => a.ahead - b.ahead);
    const ids = new Set(candidates.map(c => c.report.id));
    for (const id of this.pending.keys()) if (!ids.has(id)) this.pending.delete(id);
    const first = candidates[0];
    if (!first) return empty;
    const nearby = { id: first.report.id, distanceMeters: Math.round(first.ahead / 50) * 50,
      text: tx('voice.congestion') };
    let pending = this.pending.get(first.report.id);
    if (!pending || fix.timestamp - pending.timestamp > 3000) pending = { timestamp: fix.timestamp, count: 1 };
    else if (fix.timestamp > pending.timestamp) pending = { timestamp: fix.timestamp, count: pending.count + 1 };
    this.pending.set(first.report.id, pending);
    if (pending.count < 2 || this.seen.has(first.report.id) || input.suppressPrompt || now - this.lastPrompt < 120000) return { nearby, speak: null };
    this.seen.add(first.report.id);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value!);
    // Muted warnings are consumed; turning audio on never replays an old warning.
    if (!input.audioEnabled || this.announced.some(point => metres(point, first.report.coordinate) < 300)) return { nearby, speak: null };
    this.announced.push(first.report.coordinate); if (this.announced.length > 100) this.announced.shift();
    this.lastPrompt = now;
    return { nearby, speak: nearby.text };
  }
}
