import type { FastifyInstance } from "fastify";
import type {UsageLimiter} from './provider-usage.js';
import {attachStorageProof} from './storage-proof.js';
import { placesQuerySchema, validateInput } from "./validation.js";

export function registerPlacesRoutes(app: FastifyInstance, options: {
  provider?: "mapbox" | "geoapify";
  token?: string;
  geoapifyKey?: string;
  permanentStorage?: boolean;
  fetchImpl?: typeof fetch;
  dailyBudget?: number;
  usage?: UsageLimiter;
  storageKey?: string;
} = {}) {
  app.addHook("preValidation", async (request) => { if (request.routeOptions.url === "/v1/places/search") validateInput(placesQuerySchema, request.query); });
  const clients = new Map<string, { count: number; until: number }>();
  const cache = new Map<string, { payload: object; expires: number }>();
  const geoapify = options.provider === "geoapify";
  let day = "";
  let dailyRequests = 0;
  const budget = Number.isInteger(options.dailyBudget) && options.dailyBudget! >= 0 ? options.dailyBudget! : 1000;
  app.get<{ Querystring: { q: string; proximity: string } }>("/v1/places/search", {
    logLevel: "silent", // Do not log users' search queries or coordinates.
    schema: { querystring: { type: "object", required: ["q", "proximity"], properties: {
      q: { type: "string", minLength: 2, maxLength: 256 },
      proximity: { type: "string", maxLength: 80, pattern: "^-?[0-9]+(\\.[0-9]+)?,-?[0-9]+(\\.[0-9]+)?$" },
    } } },
  }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!(geoapify ? options.geoapifyKey : options.token)) return reply.code(503).send({ error: "Place search is not configured." });
    const proximity = request.query.proximity.split(",").map(Number);
    if (Math.abs(proximity[0]) > 180 || Math.abs(proximity[1]) > 90) return reply.code(400).send({ error: "Invalid search location." });
    const now = Date.now();
    for (const [ip, counter] of clients) if (counter.until <= now) clients.delete(ip);
    const currentDay = new Date().toISOString().slice(0, 10);
    if (currentDay !== day) { day = currentDay; dailyRequests = 0; }
    const counter = clients.get(request.ip) ?? { count: 0, until: now + 60_000 };
    const cacheKey = JSON.stringify([request.query.q.trim().toLowerCase(), request.query.proximity]);
    const cached = geoapify ? cache.get(cacheKey) : undefined;
    const cacheHit = cached && cached.expires > now;
    if (counter.count >= 30 || (!cacheHit && dailyRequests >= budget) || (!clients.has(request.ip) && clients.size >= 5000)) {
      reply.header("Retry-After", "60");
      return reply.code(429).send({ error: "Search request limit reached. Try again later." });
    }
    counter.count++;
    clients.set(request.ip, counter);
    if (cacheHit) {
      reply.header("x-rova-places-storage", "geoapify");
      return cached.payload;
    }
    dailyRequests++;
    const url = new URL(geoapify ? "https://api.geoapify.com/v1/geocode/autocomplete" : "https://api.mapbox.com/search/geocode/v6/forward");
    url.search = new URLSearchParams(geoapify
      ? { text: request.query.q.trim(), filter: "countrycode:gh", bias: `proximity:${request.query.proximity}`, lang: "en", limit: "6", format: "geojson", apiKey: options.geoapifyKey! }
      : { q: request.query.q.trim(), proximity: request.query.proximity, country: "GH", language: "en", limit: "6", autocomplete: "true", permanent: String(options.permanentStorage === true), access_token: options.token! }).toString();
    try {
      await options.usage?.reserve(geoapify ? 'geoapify' : 'mapbox','search',1);
      await options.usage?.attempt(geoapify ? 'geoapify' : 'mapbox');
      const response = await (options.fetchImpl ?? fetch)(url.toString(), { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return reply.code(response.status === 429 ? 429 : 502).send({ error: "Search provider is unavailable. Try again later." });
      const raw: unknown = await response.json();
      if (typeof raw !== "object" || raw === null || !("features" in raw) || !Array.isArray(raw.features)) return reply.code(502).send({ error: "Search provider returned an invalid response." });
      const payload=attachStorageProof(raw,geoapify?'geoapify':'mapbox',geoapify||options.permanentStorage===true,options.storageKey);
      reply.header("x-rova-places-storage", geoapify ? "geoapify" : options.permanentStorage ? "permanent" : "temporary");
      if (geoapify) {
        if (cache.size >= 40) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { payload, expires: now + 300_000 });
      }
      return payload;
    } catch (error) { const e=error as {statusCode?:number;retryAfter?:number}; if(e.retryAfter)reply.header('Retry-After',String(e.retryAfter));return reply.code(e.statusCode===429?429:503).send({ error: "Search is temporarily unavailable or its request limit has been reached. Try again later." }); }
  });
}
