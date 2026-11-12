import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { registerPlacesRoutes } from "./places.js";

test("proxy validates requests, restricts upstream, protects credentials and enforces budget", async () => {
  const app = Fastify();
  let calls = 0;
  registerPlacesRoutes(app, { token: "sk.server-only", dailyBudget: 1, fetchImpl: (async (input) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.mapbox.com");
    assert.equal(url.searchParams.get("country"), "GH");
    assert.equal(url.searchParams.get("access_token"), "sk.server-only");
    assert.equal(url.searchParams.get("permanent"), "false");
    return new Response(JSON.stringify({ features: [] }), { status: 200 });
  }) as typeof fetch });
  try {
    assert.equal((await app.inject("/v1/places/search?q=x&proximity=-0.187,5.6037")).statusCode, 400);
    assert.equal((await app.inject("/v1/places/search?q=Accra&proximity=181,5")).statusCode, 400);
    const response = await app.inject("/v1/places/search?q=Accra&proximity=-0.187,5.6037");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-rova-places-storage"], "temporary");
    assert.equal(response.body.includes("server-only"), false);
    assert.equal((await app.inject("/v1/places/search?q=Osu&proximity=-0.187,5.6037")).statusCode, 429);
    assert.equal(calls, 1);
  } finally { await app.close(); }
});

test("proxy fails closed when unconfigured and sanitizes provider failures", async () => {
  for (const token of [undefined, "sk.server-only"]) {
    const app = Fastify();
    registerPlacesRoutes(app, { token, fetchImpl: (async () => { throw new Error("url-with-secret"); }) as typeof fetch });
    try {
      const response = await app.inject("/v1/places/search?q=Accra&proximity=-0.187,5.6037");
      assert.equal(response.statusCode, 503);
      assert.equal(response.body.includes("secret"), false);
    } finally { await app.close(); }
  }
});

test("Geoapify proxy supports street and amenity records, keeps the key server-side and caches within budget", async () => {
  const app = Fastify();
  let upstream = 0;
  registerPlacesRoutes(app, { provider: "geoapify", geoapifyKey: "server-key", dailyBudget: 1, fetchImpl: (async (input) => {
    upstream++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.geoapify.com");
    assert.equal(url.pathname, "/v1/geocode/autocomplete");
    assert.equal(url.searchParams.get("apiKey"), "server-key");
    assert.equal(url.searchParams.get("filter"), "countrycode:gh");
    assert.equal(url.searchParams.get("bias"), "proximity:-0.187,5.6037");
    assert.equal(url.searchParams.has("type"), false); // Keep streets AND amenities eligible.
    return new Response(JSON.stringify({ features: [{ properties: { place_id: "fixture", name: "Test Market", country_code: "gh" }, geometry: { coordinates: [-0.2, 5.6] } }] }));
  }) as typeof fetch });
  try {
    const url = "/v1/places/search?q=Test&proximity=-0.187,5.6037";
    const first = await app.inject(url);
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers["x-rova-places-storage"], "geoapify");
    assert.equal(first.body.includes("server-key"), false);
    assert.equal((await app.inject(url)).statusCode, 200);
    assert.equal(upstream, 1);
    assert.equal((await app.inject("/v1/places/search?q=Other&proximity=-0.187,5.6037")).statusCode, 429);
  } finally { await app.close(); }
});
