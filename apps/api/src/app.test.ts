import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { buildApp } from "./app.js";
import { assertDemoSeedAllowed, readConfig } from "./config.js";
const config = (extra: NodeJS.ProcessEnv = {}) => readConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", ...extra });
const database = (ready = true) => ({ query: async () => { if (!ready) throw new Error("private-db-password-and-coordinates"); return { rows: [{ postgis: true, schema_ready: true, migrated: true }] }; }, end: async () => {}, on: () => {} }) as unknown as Pool;
test("environment config validates ports, budgets, proxy scope, CORS and production database without exposing secrets", () => {
  for (const extra of [{ PORT: "invalid" }, { ROUTING_DAILY_REQUEST_BUDGET: "-1" }, { TRUST_PROXY_CIDRS: "true" }, { CORS_ORIGINS: "*" }, { ROVA_ADMIN_IMPORT_TOKEN: "private-short-token" }]) assert.throws(() => config(extra));
  assert.throws(() => readConfig({ NODE_ENV: "production" }), /DATABASE_URL/);
  assert.throws(() => config({ DATABASE_URL: "secret-invalid-password" }), (error: unknown) => error instanceof Error && !error.message.includes("secret-invalid-password"));
  assert.equal(config().trustProxy, false);
  assert.deepEqual(config({ TRUST_PROXY_CIDRS: "127.0.0.1/32" }).trustProxy, ["127.0.0.1/32"]);
  assert.throws(() => config({ DATABASE_SSL: "true", DATABASE_URL: "postgres://local-test@127.0.0.1/rova?sslmode=no-verify" }), /TLS/);
  assert.doesNotThrow(() => assertDemoSeedAllowed(config(), "true"));
  assert.throws(() => assertDemoSeedAllowed(config(), "false"));
  assert.throws(() => assertDemoSeedAllowed(config({ DATABASE_URL: "postgres://local-test@127.0.0.1/rova" }), "true"));
  assert.throws(() => assertDemoSeedAllowed(config({ NODE_ENV: "production", DATABASE_URL: "postgres://local-test@127.0.0.1:54329/rova" }), "true"));
});
test("liveness, database readiness, security headers, bounded errors and API docs", async () => {
  const app = await buildApp({ config: config(), database: database(), logger: false });
  try {
    const health = await app.inject("/health"); assert.equal(health.statusCode, 200); assert.equal(health.headers["x-content-type-options"], "nosniff"); assert.ok(health.headers["x-request-id"]); assert.equal(health.headers["cache-control"], "no-store");
    assert.equal((await app.inject("/ready")).statusCode, 200);
    const docs = await app.inject("/openapi.json"); assert.equal(docs.json().openapi, "3.1.0"); assert.ok(docs.json().paths["/routes"]);
    const bad = await app.inject("/routes?origin=181,5&destination=0,5"); assert.equal(bad.statusCode, 400); assert.equal(bad.json().code, "VALIDATION_ERROR");
    assert.equal((await app.inject("/routes?origin=0,0&destination=1,1&unexpected=1")).statusCode, 400);
    assert.equal((await app.inject("/v1/places/search?q=a&proximity=0,0")).statusCode, 400);
    const malformed = await app.inject({ method: "POST", url: "/v1/admin/speed-rules/import", headers: { "content-type": "application/json" }, payload: "{broken" }); assert.equal(malformed.statusCode, 400); assert.ok(!malformed.body.includes("broken"));
    assert.equal((await app.inject({ method: "POST", url: "/v1/admin/speed-rules/import", payload: { oversized: "x".repeat(1048577) } })).statusCode, 413);
  } finally { await app.close(); }
  const unavailable = await buildApp({ config: config(), database: database(false), logger: false });
  try { assert.equal((await unavailable.inject("/health")).statusCode, 200); const ready = await unavailable.inject("/ready"); assert.equal(ready.statusCode, 503); assert.ok(!ready.body.includes("password")); } finally { await unavailable.close(); }
});
test("global per-IP rate limit respects health probes, rejects spoofed forwarding and enforces CORS allowlist", async () => {
  const app = await buildApp({ config: config({ RATE_LIMIT_MAX: "2" }), database: database(), logger: false });
  try {
    for (let i = 0; i < 4; i++) assert.equal((await app.inject("/health")).statusCode, 200);
    assert.equal((await app.inject({ url: "/openapi.json", headers: { origin: "http://localhost:3000" } })).headers["access-control-allow-origin"], "http://localhost:3000");
    assert.equal((await app.inject({ url: "/openapi.json", headers: { origin: "https://untrusted.example" } })).headers["access-control-allow-origin"], undefined);
    const limited = await app.inject({ url: "/ready", headers: { "x-forwarded-for": "203.0.113.99" } }); assert.equal(limited.statusCode, 429); assert.ok(limited.headers["retry-after"]);
  } finally { await app.close(); }
});
test("imports fail closed, validate only after authorization and remain disabled in production", async () => {
  const token = "test-only-authorization-token-32-characters";
  const app = await buildApp({ config: config({ ROVA_ADMIN_IMPORT_TOKEN: token }), database: database(), logger: false });
  try { assert.equal((await app.inject({ method: "POST", url: "/v1/admin/speed-rules/import", payload: {} })).statusCode, 401); assert.equal((await app.inject({ method: "POST", url: "/v1/admin/speed-rules/import", headers: { authorization: `Bearer ${token}` }, payload: {} })).statusCode, 400); } finally { await app.close(); }
  const prod = await buildApp({ config: readConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://local-test@127.0.0.1/rova", ROVA_ADMIN_IMPORT_TOKEN: token }), database: database(), logger: false });
  try { assert.equal((await prod.inject({ method: "POST", url: "/v1/admin/speed-rules/import", headers: { authorization: `Bearer ${token}` }, payload: {} })).statusCode, 503); } finally { await prod.close(); }
});
test("structured request/error logs omit queries, credentials, coordinates and raw error messages", async () => {
  const app = await buildApp({ config: config(), database: database(), logger: false });
  const logs: unknown[] = [];
  app.log.info = ((...args: unknown[]) => { logs.push(args); }) as typeof app.log.info;
  app.log.error = ((...args: unknown[]) => { logs.push(args); }) as typeof app.log.error;
  app.get("/test-failure", async () => { throw new Error("private-password-upstream-url-and-location"); });
  try {
    await app.inject({ url: "/routes?origin=12.1234567,5&destination=1,1", headers: { authorization: "Bearer private-token" } });
    const failed = await app.inject("/test-failure?secret=private-query");
    assert.equal(failed.statusCode, 500);
    const text = JSON.stringify(logs);
    for (const secret of ["12.1234567", "private-token", "private-password", "private-query"]) assert.ok(!text.includes(secret));
    assert.ok(text.includes("requestId")); assert.ok(text.includes("durationMs"));
  } finally { await app.close(); }
});
