import type { CommunityIncident, HazardSnapshot } from '@rova/shared';

export function regionCenter(lon: number, lat: number): [number, number] { return [Math.round(lon * 50) / 50, Math.round(lat * 50) / 50]; }
export function separation(a: [number, number], b: [number, number]) {
  return Math.hypot((a[0] - b[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111320);
}
export function selectHazardRegion(previous: [number, number] | undefined, point: [number, number]): [number, number] {
  // Larger than a grid-cell half diagonal (~1.57km), preventing corner jitter reconnects.
  return previous && separation(previous, point) <= 1800 ? previous : regionCenter(...point);
}
export function parseHazardSnapshot(value: unknown, now = Date.now()): HazardSnapshot {
  const s = value as HazardSnapshot;
  if (!s || s.type !== 'snapshot' || !s.region || s.region.radiusMeters !== 4000 || !Number.isFinite(s.region.lon) || !Number.isFinite(s.region.lat)
    || s.region.lon < -4 || s.region.lon > 2 || s.region.lat < 4 || s.region.lat > 12
    || !Number.isFinite(Date.parse(s.checkedAt)) || Date.parse(s.checkedAt) > now + 30000 || now - Date.parse(s.checkedAt) > 60000
    || s.traffic?.status !== 'unavailable' || s.traffic.measurements !== false || typeof s.truncated !== 'boolean' || !Array.isArray(s.reports) || s.reports.length > 50) throw new Error('Invalid hazard snapshot');
  for (const r of s.reports) {
    if (!r || !/^[a-f0-9-]{36}$/i.test(r.id) || r.status !== 'verified' || r.evidence !== 'community' || r.authorityVerified !== false
      || !['pothole', 'flood', 'collision', 'closure', 'congestion', 'obstacle'].includes(r.category)
      || !Array.isArray(r.coordinate) || r.coordinate.length !== 2 || !r.coordinate.every(Number.isFinite)
      || r.coordinate[0] < -4 || r.coordinate[0] > 2 || r.coordinate[1] < 4 || r.coordinate[1] > 12
      || !Number.isFinite(r.approximateRadiusMeters) || r.approximateRadiusMeters < 100 || r.approximateRadiusMeters > 1000
      || !Number.isInteger(r.revision) || r.revision < 1 || !Number.isInteger(r.confirmations) || r.confirmations < 0 || !Number.isInteger(r.notThere) || r.notThere < 0
      || !Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1 || !Number.isFinite(Date.parse(r.reportedAt)) || !Number.isFinite(Date.parse(r.expiresAt))) throw new Error('Invalid reviewed community report');
  }
  // Old/expired records never reappear, including delayed frames during reconnect.
  return { ...s, reports: s.reports.filter(r => Date.parse(r.expiresAt) > now) };
}
export class SseParser {
  private pending = '';
  push(chunk: string): { event: string; data: unknown }[] {
    this.pending = (this.pending + chunk).replace(/\r\n/g, '\n');
    if (this.pending.length > 131072) throw new Error('Hazard frame too large');
    const frames = [];
    let end: number;
    while ((end = this.pending.indexOf('\n\n')) >= 0) {
      const block = this.pending.slice(0, end); this.pending = this.pending.slice(end + 2);
      const lines = block.split('\n');
      const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim() ?? 'message';
      const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
      if (data) frames.push({ event, data: JSON.parse(data) });
    }
    return frames;
  }
}
export type HazardFeedState = { reports: CommunityIncident[]; checkedAt: number | null; stale: boolean; transport: 'connecting' | 'stream' | 'refresh' | 'offline'; truncated: boolean };
export interface HazardTransport {
  stream(signal: AbortSignal, onSnapshot: (snapshot: unknown) => void): Promise<void>;
  refresh(signal: AbortSignal): Promise<unknown>;
}
export function retryDelay(attempt: number, random = Math.random) { return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5) * (.8 + random() * .4)); }
export class HazardFeed {
  private stopped = true;
  private snapshot: HazardSnapshot | null = null;
  private receivedAt = 0;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private tick: ReturnType<typeof setInterval> | undefined;
  private streamAbort: AbortController | undefined;
  private refreshAbort: AbortController | undefined;
  private lastRefresh = 0;
  private mode: HazardFeedState['transport'] = 'connecting';
  readonly metrics = { reconnects: 0, snapshots: 0, refreshes: 0, errors: 0, ignoredOlderSnapshots: 0 };
  constructor(private transport: HazardTransport, private change: (state: HazardFeedState) => void, private coordinate: [number, number], private now = Date.now) {}
  start() {
    if (!this.stopped) return; this.stopped = false;
    this.emit();
    this.tick = setInterval(() => { this.emit(); if (this.now() - this.receivedAt > 15000 && this.now() - this.lastRefresh >= 30000) void this.refresh(); }, 1000);
    void this.connect(); void this.refresh();
  }
  stop() { this.stopped = true; clearTimeout(this.retry); clearInterval(this.tick); this.streamAbort?.abort(); this.refreshAbort?.abort(); }
  setCoordinate(coordinate: [number, number]) { this.coordinate = coordinate; this.emit(); }
  private accept(value: unknown, mode: 'stream' | 'refresh') {
    if (this.stopped) return;
    const snapshot = parseHazardSnapshot(value, this.now());
    if (separation([snapshot.region.lon, snapshot.region.lat], this.coordinate) > 1800) throw new Error('Hazard region mismatch');
    if (this.snapshot && Date.parse(snapshot.checkedAt) < Date.parse(this.snapshot.checkedAt)) { this.metrics.ignoredOlderSnapshots++; return; }
    this.snapshot = snapshot; this.receivedAt = this.now(); this.mode = mode; this.metrics.snapshots++;
    if (mode === 'stream') this.failures = 0;
    this.emit();
  }
  private emit() {
    if (this.stopped) return;
    const now = this.now(); const checkedAt = this.snapshot ? Date.parse(this.snapshot.checkedAt) : null;
    this.change({ reports: (this.snapshot?.reports ?? []).filter(r => Date.parse(r.expiresAt) > now && separation(r.coordinate, this.coordinate) <= 2000),
      checkedAt, stale: checkedAt === null || now - checkedAt > 30000, transport: this.mode, truncated: this.snapshot?.truncated ?? false });
  }
  private async connect() {
    if (this.stopped) return;
    this.streamAbort = new AbortController();
    try { await this.transport.stream(this.streamAbort.signal, value => this.accept(value, 'stream')); }
    catch { if (!this.stopped) this.metrics.errors++; }
    if (this.stopped) return;
    this.mode = 'offline'; this.emit(); this.metrics.reconnects++;
    this.retry = setTimeout(() => { void this.connect(); }, retryDelay(this.failures++));
  }
  private async refresh() {
    if (this.stopped || this.refreshAbort) return;
    this.refreshAbort = new AbortController(); this.lastRefresh = this.now(); this.metrics.refreshes++;
    try { this.accept(await this.transport.refresh(this.refreshAbort.signal), 'refresh'); }
    catch { if (!this.stopped) { this.metrics.errors++; this.mode = 'offline'; this.emit(); } }
    finally { this.refreshAbort = undefined; }
  }
}
