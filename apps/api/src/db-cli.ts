import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { assertDemoSeedAllowed, readConfig } from "./config.js";
import { loadMigrations, migrate } from "./migrations.js";
const command = process.argv[2];
const config = readConfig();
const client = new Client({ connectionString: config.DATABASE_URL, ssl: config.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined, connectionTimeoutMillis: 5000 });
try {
  if (command === "seed-demo") assertDemoSeedAllowed(config);
  await client.connect();
  if (command === "migrate") console.log(JSON.stringify({ applied: await migrate(client, await loadMigrations(), process.argv.includes("--baseline-legacy")) }));
  else if (command === "seed-demo") {
    await client.query("BEGIN");
    try {
      await client.query("SELECT set_config('rova.allow_synthetic_seed','on',true),set_config('rova.environment',$1,true)", [config.NODE_ENV]);
      await client.query(await readFile(new URL("../db/demo-seed.sql", import.meta.url), "utf8"));
      await client.query("COMMIT"); console.log("Synthetic demo drafts seeded. They cannot be published.");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  } else throw new Error("Use migrate or seed-demo.");
} catch (error) {
  const code = (error as { code?: string }).code;
  // PostgreSQL error details can include coordinates or input data; never print them.
  console.error(code ? `Database operation failed (${code}). Check setup and migration constraints.` : error instanceof Error ? error.message : "Database operation failed."); process.exitCode = 1;
} finally { await client.end(); }
