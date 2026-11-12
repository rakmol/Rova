import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import type { RoutingProvider, RoutingResponse } from "@rova/shared";
import { createGeoapifyRoutingProvider, parseRoutingFeature, registerRoutingRoutes, RoutingServiceError } from "./routing.js";
const origin: [number, number] = [-0.187, 5.6037];
const destination: [number, number] = [-0.173, 5.622];
const feature = (middle = -0.18) => ({ properties: { distance: 4500, time: 600, legs: [{ steps: [{ distance: 100, time: 20, instruction: { text: "Test turn" } }] }] }, geometry: { type: "MultiLineString", coordinates: [[origin, [middle, 5.61], destination]] } });

test("Geoapify adapter requests documented preferences with correct coordinate order and deduplicates real paths", async () => {
  const types: string[] = [];
  const provider = createGeoapifyRoutingProvider({ key: "server-only", fetchImpl: (async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.geoapify.com");
    assert.equal(url.searchParams.get("waypoints"), "5.6037,-0.187|5.622,-0.173");
    assert.equal(url.searchParams.get("mode"), "drive");
    types.push(url.searchParams.get("type")!);
    return new Response(JSON.stringify({ features: [feature(types.length === 2 ? -0.181 : -0.18)] }));
  }) as typeof fetch });
  const result = await provider.routes(origin, destination);
  assert.deepEqual(types, ["balanced", "short", "less_maneuvers"]);
  assert.equal(result.routes.length, 2);
  assert.equal(result.routes[0].geometry.type, "LineString");
  assert.equal(result.routes[0].maneuvers[0].instruction, "Test turn");
  assert.equal(result.routes[0].trafficAware, false);
  assert.equal(result.routes[0].etaKind, "static_estimate");
  assert.equal(result.routes[0].tolls, "unknown");
  assert.equal(result.routes[0].isSample, false);
});

test("invalid or disconnected geometry is rejected, while explicit toll metadata is preserved", () => {
  assert.equal(parseRoutingFeature({ ...feature(), geometry: { type: "LineString", coordinates: [[181, 5], destination] } }, "Test"), null);
  assert.equal(parseRoutingFeature({ ...feature(), geometry: { type: "MultiLineString", coordinates: [[origin, destination], [[1, 1], [2, 2]]] } }, "Test"), null);
  assert.equal(parseRoutingFeature({ ...feature(), properties: { distance: -1, time: 2 } }, "Test"), null);
  assert.equal(parseRoutingFeature({ ...feature(), properties: { ...feature().properties, toll: true } }, "Test")?.tolls, "present");
  assert.equal(parseRoutingFeature({ ...feature(), properties: { ...feature().properties, toll: false } }, "Test")?.tolls, "none_reported");
});

test("maneuvers retain real geometry indexes across connected legs without inventing missing locations", () => {
  const middle = [-0.18, 5.61];
  const parsed = parseRoutingFeature({ properties: { distance: 1000, time: 100, legs: [{ steps: [{ instruction: { text: "Test departure" }, from_index: 0 }] }, { steps: [{ instruction: { text: "Test turn" }, from_index: 0 }, { instruction: { text: "Unlocated test" } }] }] }, geometry: { type: "MultiLineString", coordinates: [[origin, middle], [middle, destination]] } }, "Test route");
  assert.deepEqual(parsed?.maneuvers.map((step) => step.geometryIndex), [0, 1, undefined]);
});

test("no routes stays empty; partial alternative failure keeps genuine routes and a warning", async () => {
  const empty = createGeoapifyRoutingProvider({ key: "key", fetchImpl: (async () => new Response(JSON.stringify({ features: [] }))) as typeof fetch });
  assert.equal((await empty.routes(origin, destination)).routes.length, 0);
  let calls = 0;
  const partial = createGeoapifyRoutingProvider({ key: "key", fetchImpl: (async () => {
    if (++calls > 1) throw new Error("private-upstream-url-with-key");
    return new Response(JSON.stringify({ features: [feature()] }));
  }) as typeof fetch });
  const result = await partial.routes(origin, destination);
  assert.equal(result.routes.length, 1); assert.equal(result.warnings.length, 1);
  const failed = createGeoapifyRoutingProvider({ key: "key", fetchImpl: (async () => { throw new Error("private-secret"); }) as typeof fetch });
  await assert.rejects(failed.routes(origin, destination), (e: unknown) => e instanceof RoutingServiceError && !e.message.includes("private-secret"));
});

test("GET /routes validates coordinates, returns a cache hit without billing again, and enforces its budget", async () => {
  const app = Fastify(); let calls = 0;
  // Fake adapter exists only in this automated test. No runtime sample/fallback adapter exists.
  const provider: RoutingProvider = { routes: async () => { calls++; return { provider: "geoapify", routes: [parseRoutingFeature(feature(), "Test route")!], warnings: [], fetchedAt: "2026-11-07T00:00:00Z" }; } };
  registerRoutingRoutes(app, { provider, dailyBudget: 3 });
  try {
    assert.equal((await app.inject("/routes?origin=181,5&destination=-0.173,5.622")).statusCode, 400);
    const url = "/routes?origin=-0.187,5.6037&destination=-0.173,5.622";
    const result = await app.inject(url);
    assert.equal(result.statusCode, 200); assert.equal(result.headers["cache-control"], "no-store");
    assert.equal((result.json() as RoutingResponse).routes[0].trafficAware, false);
    assert.equal((await app.inject(url)).statusCode, 200); assert.equal(calls, 1);
    assert.equal((await app.inject("/routes?origin=-0.188,5.6037&destination=-0.173,5.622")).statusCode, 429);
  } finally { await app.close(); }
});

test("routing fails closed without credentials and sanitizes adapter failures", async () => {
  for (const provider of [undefined, { routes: async () => { throw new Error("secret-key"); } }]) {
    const app = Fastify(); registerRoutingRoutes(app, { provider });
    try { const result = await app.inject("/routes?origin=-0.187,5.6037&destination=-0.173,5.622"); assert.equal(result.statusCode, provider ? 502 : 503); assert.equal(result.body.includes("secret-key"), false); }
    finally { await app.close(); }
  }
});
