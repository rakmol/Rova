import {networkSnapshot,requestOutcome} from "../offline/network";
import type { RoutingCoordinate, RoutingProvider, RoutingResponse } from "@rova/shared";

export function createHttpRoutingProvider(endpoint: string | undefined, fetchImpl: typeof fetch = (...args) => fetch(...args)): RoutingProvider {
  return { routes: async (origin: RoutingCoordinate, destination: RoutingCoordinate, signal?: AbortSignal) => {
    if(networkSnapshot().status==='offline')throw new Error("You are offline. Resume a saved route; calculating new routes requires internet.");
    if (!endpoint) throw new Error("Route options need the ROVA backend. Connect to the development server or configure the routing endpoint.");
    const url = new URL(endpoint);
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Routing endpoint must use HTTPS.");
    for (const point of [origin, destination]) if (point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error("Invalid route coordinates.");
    if (signal?.aborted) { const error = new Error("Cancelled"); error.name = "AbortError"; throw error; }
    url.searchParams.set("origin", origin.join(",")); url.searchParams.set("destination", destination.join(","));
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    const timeout = setTimeout(cancel, 28000);
    try {
      const response = await fetchImpl(url.toString(), { signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many route requests. Wait a minute and retry." : response.status === 503 ? "Routing backend is not configured or is unavailable." : "Could not calculate routes. Check your connection and retry.");
      const payload = await response.json() as RoutingResponse;
      if (payload.provider !== "geoapify" || !Array.isArray(payload.routes) || !Array.isArray(payload.warnings) || payload.warnings.some((warning) => typeof warning !== "string") || typeof payload.fetchedAt !== "string") throw new Error("Routing returned an invalid response.");
      for (const route of payload.routes) {
        if (typeof route.id !== "string" || !route.id || typeof route.label !== "string" || !route.label || typeof route.attribution !== "string" || route.geometry?.type !== "LineString" || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || route.geometry.coordinates.length > 50000
          || route.geometry.coordinates.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === "number" && Number.isFinite(n)) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)
          || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(route.durationSeconds) || route.durationSeconds < 0
          || route.trafficAware !== false || route.etaKind !== "static_estimate" || !["unknown", "present", "none_reported"].includes(route.tolls) || !Array.isArray(route.maneuvers)
          || typeof route.isSample !== "boolean" || route.maneuvers.some((step) => typeof step.instruction !== "string" || [step.distanceMeters, step.durationSeconds].some((value) => value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)))) throw new Error("Routing returned an invalid route.");
      }
      if (payload.routes.some((route) => route.maneuvers.some((step) => step.geometryIndex !== undefined && (!Number.isInteger(step.geometryIndex) || step.geometryIndex < 0 || step.geometryIndex >= route.geometry.coordinates.length)))) throw new Error("Routing returned invalid maneuver geometry.");
      requestOutcome(true);
      return payload;
    } catch (error) {
      if (signal?.aborted) throw error;
      requestOutcome(false);
      if (controller.signal.aborted) throw new Error("Route calculation timed out. Check your connection and retry.");
      if (error instanceof TypeError || error instanceof SyntaxError) throw new Error("Could not load routes. Check your connection and retry.");
      throw error;
    } finally { clearTimeout(timeout); signal?.removeEventListener("abort", cancel); }
  } };
}
