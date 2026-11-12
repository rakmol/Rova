import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Client } from "pg";
export interface Migration { version: string; sql: string; checksum: string }
export async function loadMigrations(directory = new URL("../db/init/", import.meta.url)): Promise<Migration[]> {
  const files = (await readdir(directory)).filter((name) => /^\d{3}[-_][a-z0-9_-]+\.sql$/.test(name)).sort();
  return Promise.all(files.map(async (version) => { const sql = (await readFile(new URL(version, directory), "utf8")).replaceAll("\r\n", "\n"); return { version, sql, checksum: createHash("sha256").update(sql).digest("hex") }; }));
}
export async function migrate(client: Client, migrations: Migration[], baselineLegacy = false) {
  await client.query("SELECT pg_advisory_lock(hashtext('rova.schema_migrations'))");
  try {
    const legacy = await client.query("SELECT to_regclass('public.schema_migrations') AS ledger, to_regclass('public.road_segments') AS roads");
    if (!legacy.rows[0].ledger && legacy.rows[0].roads) {
      if (!baselineLegacy) throw new Error("Existing schema requires reviewed --baseline-legacy before migration.");
      const expected = await client.query("SELECT to_regclass('public.speed_rule_approvals') AS approvals, to_regclass('public.official_speed_rule_imports') AS imports, EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='speed_rules_require_independent_approvals') AS guard");
      if (!expected.rows[0].approvals || !expected.rows[0].imports || !expected.rows[0].guard) throw new Error("Legacy schema is not the expected 001/002 foundation; inspect before baselining.");
    }
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    if (!legacy.rows[0].ledger && legacy.rows[0].roads && baselineLegacy) {
      await client.query("BEGIN");
      try { for (const migration of migrations.slice(0, 2)) await client.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", [migration.version, migration.checksum]); await client.query("COMMIT"); }
      catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    const applied = await client.query<{ version: string; checksum: string }>("SELECT version,checksum FROM schema_migrations ORDER BY version");
    for (const row of applied.rows) {
      const source = migrations.find((migration) => migration.version === row.version);
      if (!source || source.checksum !== row.checksum.trim()) throw new Error(`Migration checksum mismatch: ${row.version}`);
    }
    const completed: string[] = [];
    for (const migration of migrations) {
      if (applied.rows.some((row) => row.version === migration.version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", [migration.version, migration.checksum]);
        await client.query("COMMIT"); completed.push(migration.version);
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
    return completed;
  } finally { await client.query("SELECT pg_advisory_unlock(hashtext('rova.schema_migrations'))"); }
}
