import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { denied } from './admin-auth.js';

const text = (max: number) => z.string().trim().max(max).refine(v => !/[\p{Cc}]/u.test(v), 'Use plain text.');
export const contributionBody = z.object({
  kind: z.enum(['place', 'fixed_camera']), name: text(120).pipe(z.string().min(2)),
  category: z.enum(['landmark', 'market', 'business', 'junction', 'other', 'fixed_speed', 'red_light', 'unknown']),
  lon: z.number().finite().min(-4).max(2), lat: z.number().finite().min(4).max(12),
  note: text(500).default(''), direction: text(120).default(''), interaction: z.enum(['parked', 'passenger']),
}).strict().refine(v => (v.kind === 'place' ? ['landmark','market','business','junction','other'] : ['fixed_speed','red_light','unknown']).includes(v.category), 'Choose a category for this contribution.');

type Access = {
  actor(request: FastifyRequest): Promise<string>;
  moderator(request: FastifyRequest): Promise<unknown>;
  quota(c: PoolClient, key: string, max: number, seconds: number): Promise<void>;
  ipKey(request: FastifyRequest): string;
};
export function registerContributions(app: FastifyInstance, db: Pool, access: Access) {
  const bounded = { bodyLimit: 4096, config: { rateLimit: { max: 20, timeWindow: 60000 } } };
  app.post('/v1/incidents/contributions', bounded, async (request, reply) => {
    const device = await access.actor(request), b = contributionBody.parse(request.body);
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      await access.quota(c, 'contribution-device:' + device, 5, 3600);
      await access.quota(c, 'contribution-ip:' + access.ipKey(request), 20, 3600);
      await c.query("SELECT pg_advisory_xact_lock(hashtext('contribution-create'),hashtext($1))", [b.kind]);
      // Only disclose duplicates belonging to this reporting session.
      const duplicate = await c.query(`SELECT id FROM community_contributions WHERE device_id=$1 AND kind=$2 AND category=$3
        AND lower(name)=lower($4) AND status IN ('pending','reviewed') AND expires_at>now()
        AND ST_DWithin(geometry::geography,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,50) LIMIT 1`, [device,b.kind,b.category,b.name,b.lon,b.lat]);
      const row = duplicate.rows[0] ?? (await c.query(`INSERT INTO community_contributions(device_id,kind,name,category,geometry,note,direction)
        VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326),$7,$8) RETURNING id`, [device,b.kind,b.name,b.category,b.lon,b.lat,b.note,b.direction])).rows[0];
      await c.query('COMMIT');
      return reply.code(duplicate.rows.length ? 200 : 201).send({ id: row.id, duplicate: !!duplicate.rows.length, authorityVerified: false, notice: 'Sent for review. This does not publish a place or confirm enforcement equipment.' });
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  });
  app.get('/v1/incidents/contributions/mine', bounded, async request => {
    const device = await access.actor(request);
    return { rows: (await db.query(`SELECT id,kind,name,category,status,created_at,expires_at FROM community_contributions
      WHERE device_id=$1 AND expires_at>now() ORDER BY created_at DESC LIMIT 30`, [device])).rows, authorityVerified: false };
  });
  app.get('/v1/ops/contributions', async request => {
    await access.moderator(request);
    return { rows: (await db.query(`SELECT id,kind,name,category,note,direction,status,revision,created_at,expires_at,
      ST_X(geometry) AS lon,ST_Y(geometry) AS lat FROM community_contributions WHERE expires_at>now() ORDER BY status='pending' DESC,created_at DESC LIMIT 100`)).rows,
      scope: 'Community suggestions only. Reviewed does not mean authority verified or published to navigation.' };
  });
  app.post('/v1/ops/contributions/review', bounded, async request => {
    const actor = await access.moderator(request);
    const b = z.object({ id:z.uuid(), revision:z.number().int().positive(), status:z.enum(['reviewed','rejected']), comment:z.string().trim().min(10).max(1000) }).strict().parse(request.body);
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      const before = (await c.query('SELECT id,status,revision FROM community_contributions WHERE id=$1 AND expires_at>now() FOR UPDATE', [b.id])).rows[0];
      if (!before || before.revision !== b.revision) throw denied(409, 'Contribution changed or expired. Refresh first.');
      await c.query('UPDATE community_contributions SET status=$2,revision=revision+1,reviewed_at=now() WHERE id=$1', [b.id,b.status]);
      await c.query(`INSERT INTO admin_action_logs(actor,action,entity,entity_id,before_json,after_json,comment)
        VALUES($1,'review_contribution','contribution',$2,$3,$4,$5)`, [String(actor),b.id,JSON.stringify(before),JSON.stringify({status:b.status,revision:before.revision+1}),b.comment]);
      await c.query('COMMIT'); return { saved:true, authorityVerified:false };
    } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  });
}
