import { createHash } from "node:crypto";
import type {UsageLimiter} from './provider-usage.js';
import type { FastifyInstance } from "fastify";
import type { RoutingCoordinate, RoutingOption, RoutingProvider, RoutingResponse } from "@rova/shared";
import { routesQuerySchema, validateInput } from "./validation.js";

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonnegative = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const coordinate = (v: unknown): v is RoutingCoordinate => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90;
const preferences = [{ type: "balanced", label: "Balanced route" }, { type: "short", label: "Shorter distance" }, { type: "less_maneuvers", label: "Fewer turns" }] as const;
export class RoutingServiceError extends Error {
  constructor(message: string, readonly statusCode = 502) { super(message); }
}

export function parseRoutingFeature(value: unknown, label: string): RoutingOption | null {
  if (!record(value) || !record(value.properties) || !record(value.geometry)) return null;
  const p = value.properties;
  if (!nonnegative(p.distance) || !nonnegative(p.time)) return null;
  const segments = value.geometry.type === "LineString" ? [value.geometry.coordinates] : value.geometry.type === "MultiLineString" ? value.geometry.coordinates : null;
  if (!Array.isArray(segments)) return null;
  const coordinates: RoutingCoordinate[] = [];
  for (const segment of segments) {
    if (!Array.isArray(segment) || segment.length < 2 || !segment.every(coordinate)) return null;
    const previous = coordinates.at(-1);
    if (previous && (previous[0] !== segment[0][0] || previous[1] !== segment[0][1])) return null;
    coordinates.push(...(previous ? segment.slice(1) : segment));
    if (coordinates.length > 50000) return null;
  }
  if (coordinates.length < 2) return null;
  let legOffset = 0;
  const maneuvers = (Array.isArray(p.legs) ? p.legs : []).flatMap((leg, legIndex) => {
    const offset = legOffset;
    if (Array.isArray(segments[legIndex])) legOffset += segments[legIndex].length - 1;
    return (record(leg) && Array.isArray(leg.steps) ? leg.steps : []).flatMap((step) => {
    if (!record(step) || !record(step.instruction) || typeof step.instruction.text !== "string" || !step.instruction.text.trim()) return [];
    const localSegment = segments.length === (Array.isArray(p.legs) ? p.legs.length : 0) ? segments[legIndex] : null;
    const index = Array.isArray(localSegment) && typeof step.from_index === "number" && Number.isInteger(step.from_index) && step.from_index >= 0 && step.from_index < localSegment.length ? offset + step.from_index : undefined;
    return [{ instruction: step.instruction.text, distanceMeters: nonnegative(step.distance) ? step.distance : null, durationSeconds: nonnegative(step.time) ? step.time : null,
      ...(index !== undefined && index >= offset && index < coordinates.length ? { geometryIndex: index } : {}) }];
    });
  });
  return { id: createHash("sha256").update(JSON.stringify(coordinates)).digest("hex").slice(0, 24), label, geometry: { type: "LineString", coordinates }, distanceMeters: p.distance, durationSeconds: p.time,
    maneuvers, tolls: p.toll === true ? "present" : p.toll === false ? "none_reported" : "unknown", trafficAware: false, etaKind: "static_estimate", isSample: false, attribution: "Powered by Geoapify | OpenStreetMap contributors" };
}

export function createGeoapifyRoutingProvider(options: { key: string; fetchImpl?: typeof fetch; beforeRequest?:()=>Promise<void> }): RoutingProvider {
  return { routes: async (origin, destination, signal) => {
    if (!coordinate(origin) || !coordinate(destination)) throw new RoutingServiceError("Invalid route coordinates.", 400);
    const routes: RoutingOption[] = [];
    const warnings: string[] = [];
    for (const preference of preferences) {
      signal?.throwIfAborted();
      const url = new URL("https://api.geoapify.com/v1/routing");
      url.search = new URLSearchParams({ apiKey: options.key, waypoints: `${origin[1]},${origin[0]}|${destination[1]},${destination[0]}`, mode: "drive", type: preference.type, details: "instruction_details", units: "metric", lang: "en" }).toString();
      try {
        await options.beforeRequest?.();
        const response = await (options.fetchImpl ?? fetch)(url.toString(), { signal: AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]) });
        const payload: unknown = await response.json();
        if (!response.ok) {
          if (response.status === 400 && record(payload) && typeof payload.message === "string" && /no path|no route|unreachable/i.test(payload.message)) continue;
          throw new RoutingServiceError(response.status === 429 ? "Routing provider is busy. Try again later." : "Routing provider is unavailable. Try again.", response.status === 429 ? 429 : 502);
        }
        if (!record(payload) || !Array.isArray(payload.features)) throw new RoutingServiceError("Routing provider returned an invalid response.");
        for (const feature of payload.features) {
          const route = parseRoutingFeature(feature, preference.label);
          if (!route) throw new RoutingServiceError("Routing provider returned an invalid route.");
          if (!routes.some((item) => item.id === route.id)) routes.push(route);
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        if (!routes.length) {
          if (error instanceof RoutingServiceError || (error as {retryAfter?:number}).retryAfter) throw error;
          throw new RoutingServiceError(error instanceof Error && error.name === "TimeoutError" ? "Route calculation timed out. Check your connection and retry." : "Could not reach routing. Check your connection and retry.", error instanceof Error && error.name === "TimeoutError" ? 504 : 502);
        }
        warnings.push("Some route preferences could not be calculated. Available routes are shown.");
        break;
      }
    }
    return { provider: "geoapify", routes, warnings, fetchedAt: new Date().toISOString() };
  } };
}

export function registerRoutingRoutes(app: FastifyInstance, options: { key?: string; provider?: RoutingProvider; dailyBudget?: number;usage?:UsageLimiter } = {}) {
  app.addHook("preValidation", async (request) => { if (request.routeOptions.url === "/routes") validateInput(routesQuerySchema, request.query); });
  const provider = options.provider ?? (options.key ? createGeoapifyRoutingProvider({ key: options.key,beforeRequest:()=>options.usage?.attempt('geoapify')??Promise.resolve() }) : null);
  const clients = new Map<string, { count: number; until: number }>();
  const cache = new Map<string, { result: RoutingResponse; expires: number }>();
  const budget = Number.isInteger(options.dailyBudget) && options.dailyBudget! >= 0 ? options.dailyBudget! : 300;
  let day = ""; let spent = 0;
  app.get<{ Querystring: { origin: string; destination: string } }>("/routes", { logLevel: "silent", schema: { querystring: { type: "object", required: ["origin", "destination"], additionalProperties: false,
    properties: { origin: { type: "string", maxLength: 80, pattern: "^-?[0-9]+(\\.[0-9]+)?,-?[0-9]+(\\.[0-9]+)?$" }, destination: { type: "string", maxLength: 80, pattern: "^-?[0-9]+(\\.[0-9]+)?,-?[0-9]+(\\.[0-9]+)?$" } } } } }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const origin = request.query.origin.split(",").map(Number);
    const destination = request.query.destination.split(",").map(Number);
    if (!coordinate(origin) || !coordinate(destination)) return reply.code(400).send({ error: "Invalid route coordinates. Use longitude,latitude." });
    if (!provider) return reply.code(503).send({ error: "Routing is not configured." });
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    if (day !== today) { day = today; spent = 0; }
    for (const [ip, entry] of clients) if (entry.until <= now) clients.delete(ip);
    const client = clients.get(request.ip) ?? { count: 0, until: now + 60000 };
    const key = JSON.stringify([origin, destination]);
    const hit = cache.get(key);
    if (client.count >= 10 || (!hit && spent + 3 > budget) || (!clients.has(request.ip) && clients.size >= 5000)) return reply.header("Retry-After", "60").code(429).send({ error: "Route request limit reached. Try again later." });
    client.count++; clients.set(request.ip, client);
    if (hit && hit.expires > now) return hit.result;
    if (spent + 3 > budget) return reply.code(429).send({ error: "Daily route request budget reached." });
    spent += 3; // Reserve the maximum of three real provider requests, even on a partial failure.
    const controller = new AbortController();
    const cancel = () => controller.abort();
    request.raw.once("aborted", cancel);
    try {
      await options.usage?.reserve('geoapify','routing',3);
      const result = await provider.routes(origin, destination, controller.signal);
      if (cache.size >= 40) cache.delete(cache.keys().next().value!);
      cache.set(key, { result, expires: now + 120000 });
      return result;
    } catch (error) {
      const e=error as {statusCode?:number;retryAfter?:number};
      if(e.retryAfter)reply.header('Retry-After',String(e.retryAfter));
      const known=error instanceof RoutingServiceError||!!e.retryAfter;
      return reply.code(known?e.statusCode??503:502).send({ error: known&&error instanceof Error?error.message:"Route calculation failed. Try again." });
    } finally { request.raw.removeListener("aborted", cancel); }
  });
}
