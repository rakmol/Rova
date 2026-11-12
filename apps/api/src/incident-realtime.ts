import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import type { CommunityIncident, HazardSnapshot } from '@rova/shared';
import { z } from 'zod';

const query = z.object({ lon: z.coerce.number().finite().min(-4).max(2), lat: z.coerce.number().finite().min(4).max(12) }).strict();
export function hazardRegion(lon: number, lat: number) {
  const center = { lon: Math.round(lon * 50) / 50, lat: Math.round(lat * 50) / 50, radiusMeters: 4000 as const };
  return { ...center, key: `${center.lon.toFixed(2)}:${center.lat.toFixed(2)}` };
}
export async function approvedSnapshot(db: Pool, lon: number, lat: number, toIncident: (row: any) => CommunityIncident): Promise<HazardSnapshot> {
  const region = hazardRegion(lon, lat);
  const startedAt = Date.now();
  const rows = await db.query(`SELECT r.id,r.incident_type AS category,r.community_status AS status,
    ST_X(r.geometry) AS lon,ST_Y(r.geometry) AS lat,r.accuracy_meters,r.observed_at,r.expires_at,r.revision,
    c.confirmations,c.not_there FROM (
      SELECT * FROM incident_reports WHERE community_status='verified' AND NOT is_synthetic AND expires_at>clock_timestamp()
      AND ST_DWithin(geometry::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,4000)
      ORDER BY ST_Distance(geometry::geography,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography),id LIMIT 51
    ) r LEFT JOIN LATERAL (
      SELECT count(*) FILTER(WHERE decision='confirm')::int AS confirmations,
      count(*) FILTER(WHERE decision IN ('deny','resolved'))::int AS not_there
      FROM incident_confirmations WHERE incident_report_id=r.id
    ) c ON true`, [region.lon, region.lat]);
  const now = Date.now();
  return { type: 'snapshot', region: { lon: region.lon, lat: region.lat, radiusMeters: 4000 }, checkedAt: new Date(startedAt).toISOString(),
    reports: rows.rows.map(toIncident).filter(r => r.status === 'verified' && Date.parse(r.expiresAt) > now).slice(0, 50),
    truncated: rows.rows.length > 50, traffic: { status: 'unavailable', measurements: false } };
}
interface Peer { response: ServerResponse; device: string; blockedAt: number | null; close(): void }
interface RegionGroup { lon: number; lat: number; peers: Set<Peer>; loading: boolean; timer: ReturnType<typeof setInterval> }

export function registerIncidentRealtime(app: FastifyInstance, db: Pool, options: {
  actor(request: FastifyRequest): Promise<string>;
  moderator(request: FastifyRequest): void|Promise<unknown>;
  toIncident(row: any): CommunityIncident;
}) {
  const groups = new Map<string, RegionGroup>();
  const devices = new Map<string, number>();
  let active = 0;
  const metrics = { connections: 0, snapshots: 0, bytes: 0, databaseReads: 0, databaseErrors: 0, backpressureDrops: 0, rejectedConnections: 0 };
  const durations: number[] = [];
  const record = (start: number) => { durations.push(performance.now() - start); if (durations.length > 128) durations.shift(); };
  async function read(lon: number, lat: number) {
    const start = performance.now(); metrics.databaseReads++;
    try { return await approvedSnapshot(db, lon, lat, options.toIncident); }
    catch (error) { metrics.databaseErrors++; throw error; }
    finally { record(start); }
  }
  function send(peer: Peer, event: 'snapshot' | 'unavailable', data: unknown) {
    if (peer.response.destroyed || peer.response.writableEnded) return peer.close();
    if (peer.blockedAt !== null) {
      metrics.backpressureDrops++;
      if (Date.now() - peer.blockedAt > 15000) peer.close();
      return;
    }
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    metrics.bytes += Buffer.byteLength(frame);
    if (event === 'snapshot') metrics.snapshots++;
    if (!peer.response.write(frame)) peer.blockedAt = Date.now();
  }
  async function broadcast(group: RegionGroup) {
    if (group.loading || !group.peers.size) return;
    group.loading = true;
    try { const snapshot = await read(group.lon, group.lat); for (const peer of group.peers) send(peer, 'snapshot', snapshot); }
    catch { for (const peer of group.peers) send(peer, 'unavailable', { retryAfterSeconds: 5 }); }
    finally { group.loading = false; }
  }
  app.get('/v1/incidents/approved', { config: { rateLimit: { max: 12, timeWindow: 60000 } } }, async request => {
    await options.actor(request);
    const point = query.parse(request.query);
    return read(point.lon, point.lat);
  });
  app.get('/v1/incidents/stream', { config: { rateLimit: { max: 20, timeWindow: 60000 } } }, async (request, reply) => {
    const device = await options.actor(request);
    const point = query.parse(request.query);
    if (active >= 100 || (devices.get(device) ?? 0) >= 2) {
      metrics.rejectedConnections++;
      return reply.code(429).header('Retry-After', '30').send({ error: 'Realtime capacity reached. Use periodic refresh.' });
    }
    const region = hazardRegion(point.lon, point.lat);
    let group = groups.get(region.key);
    if (!group) {
      const created: RegionGroup = { lon: region.lon, lat: region.lat, peers: new Set(), loading: false, timer: setInterval(() => { void broadcast(created); }, 5000) };
      group = created; groups.set(region.key, group);
    }
    reply.hijack();
    const response = reply.raw;
    for (const [name,value] of Object.entries(reply.getHeaders())) if (value !== undefined) response.setHeader(name,value);
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    response.flushHeaders();
    const selectedGroup = group;
    let closed = false;
    const rotation = setTimeout(() => peer.close(), 45000);
    const peer: Peer = { response, device, blockedAt: null, close: () => {
      if (closed) return; closed = true; clearTimeout(rotation);
      selectedGroup.peers.delete(peer); active--; const count = (devices.get(device) ?? 1) - 1;
      if (count) devices.set(device, count); else devices.delete(device);
      if (!selectedGroup.peers.size) { clearInterval(selectedGroup.timer); groups.delete(region.key); }
      if (!response.writableEnded) response.end();
    } };
    active++; metrics.connections++; devices.set(device, (devices.get(device) ?? 0) + 1); selectedGroup.peers.add(peer);
    response.on('drain', () => { peer.blockedAt = null; });
    response.on('close', peer.close);
    response.on('error', peer.close);
    void broadcast(selectedGroup);
  });
  app.get('/v1/admin/incidents/realtime-metrics', async request => {
    await options.moderator(request);
    const sorted = [...durations].sort((a, b) => a - b);
    return { ...metrics, activeConnections: active, activeRegions: groups.size, databaseLatencyMs: {
      samples: sorted.length, p50: sorted[Math.floor(sorted.length * .5)] ?? 0, p95: sorted[Math.floor(sorted.length * .95)] ?? 0,
    }, pollIntervalMs: 5000, connectionCap: 100, snapshotLimit: 50, queue: 'coalesce-latest', trafficMeasurements: false };
  });
  app.addHook('preClose', async () => { for (const group of [...groups.values()]) for (const peer of [...group.peers]) peer.close(); });
}
