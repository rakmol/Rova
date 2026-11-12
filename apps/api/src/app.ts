import {postgresUsage} from './provider-usage.js';
import { randomUUID } from "node:crypto";
import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Pool } from "pg";
import { ZodError } from "zod";
import { readConfig, type ApiConfig } from "./config.js";
import { registerImportRoutes } from "./imports.js";
import { registerPlacesRoutes } from "./places.js";
import { registerRoutingRoutes } from "./routing.js";
import { openapi } from "./openapi.js";
import { registerSpeedLimitRoute } from "./speed-limit-route.js";
import { registerComplianceRoute } from "./compliance.js";
import { registerIncidentRoutes } from './incidents.js';
import { registerAccountRoutes, supabaseProvider, type DriverAuthProvider } from './accounts.js';
import { registerAdminDashboard } from './admin-dashboard.js';
import { managedAdminAuth,type AdminAuthProvider } from './admin-auth.js';
import {registerNotificationRoutes} from './notifications.js';
import {registerProviderCostDashboard} from './provider-costs.js';
import {registerOfflineSafety} from './offline.js';
class PrivateLogController extends LogController { constructor() { super({ disableRequestLogging: true }); } }
export async function buildApp(options: { config?: ApiConfig; database?: Pool; logger?: boolean; driverAuth?: DriverAuthProvider; adminAuth?:AdminAuthProvider } = {}) {
  const config = options.config ?? readConfig();
  const database = options.database ?? new Pool({ connectionString: config.DATABASE_URL, ssl: config.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined, max: 10, connectionTimeoutMillis: 2000, statement_timeout: 5000, query_timeout: 6000 });
  const app = Fastify({ logger: options.logger === false ? false : { level: config.LOG_LEVEL, redact: ["req.headers.authorization", "req.headers.cookie", "res.headers.set-cookie"] }, logController: new PrivateLogController(), genReqId: () => randomUUID(), requestIdHeader: false, trustProxy: config.trustProxy, bodyLimit: 1048576, requestTimeout: 15000, forceCloseConnections: true });
  app.addHook("onClose", async () => { await database.end(); });
  database.on?.("error", () => app.log.error({ dependency: "database" }, "Idle database connection failed"));
  app.addHook("onRequest", async (request, reply) => { reply.header("x-request-id", request.id); reply.header("Cache-Control", "no-store"); });
  await app.register(helmet);
  await app.register(cors, { origin: config.corsOrigins, methods: ["GET", "POST", "OPTIONS"] });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: 60000, cache: 5000, errorResponseBuilder: () => Object.assign(new Error("Too many requests."), { statusCode: 429, code: "RATE_LIMITED" }) });
  app.addHook("onResponse", async (request, reply) => { app.log.info({ requestId: request.id, method: request.method, route: request.routeOptions.url ?? "unmatched", statusCode: reply.statusCode, durationMs: reply.elapsedTime }, "request completed"); });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "Invalid request.", code: "VALIDATION_ERROR", requestId: request.id, issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
    const candidate = error as { statusCode?: number; code?: string; name?: string };
    if(['23514','23505','23503','22023','22P02'].includes(candidate.code??'')&&request.routeOptions.url?.startsWith('/v1/ops/'))return reply.code(409).send({error:'Safety validation rejected this change. Check current revision, geometry, provenance and approvals.',code:'SAFETY_VALIDATION'});
    if(candidate.code==='OPS_REQUEST'||candidate.code==='NOTIFICATION_REQUEST')return reply.code(candidate.statusCode??403).send({error:(error as Error).message,code:'OPS_REQUEST'});
    const status = candidate.statusCode && candidate.statusCode >= 400 && candidate.statusCode <= 599 ? candidate.statusCode : 500;
    if (status >= 500) app.log.error({ requestId: request.id, errorType: candidate.name, code: candidate.code }, "request failed");
    return reply.code(status).send({ error: status === 413 ? "Request body is too large." : status === 429 ? "Too many requests." : status >= 500 ? "Service temporarily unavailable." : "Invalid request.", code: status >= 500 ? "INTERNAL_ERROR" : status === 429 ? "RATE_LIMITED" : "BAD_REQUEST", requestId: request.id });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "Endpoint not found.", code: "NOT_FOUND" }));
  app.get("/health", { config: { rateLimit: false } }, async () => ({ service: "rova-api", status: "ok" }));
  app.get("/ready", async (_request, reply) => {
    try {
      const result = await database.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') AS postgis, to_regclass('public.speed_limit_rules') IS NOT NULL AS schema_ready, EXISTS (SELECT 1 FROM schema_migrations WHERE version='013_batch_a_protection.sql') AS migrated");
      if (!result.rows[0]?.postgis || !result.rows[0]?.schema_ready || !result.rows[0]?.migrated) throw new Error("Database setup incomplete");
      return { status: "ready" };
    } catch { app.log.warn({ dependency: "database" }, "Readiness check failed"); return reply.code(503).send({ status: "not_ready", dependency: "database" }); }
  });
  app.get("/openapi.json", async () => openapi);
  const opsAccess=registerAdminDashboard(app,database,options.adminAuth??managedAdminAuth(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,config.SUPABASE_SECRET_KEY),config.ADMIN_COVERAGE_AGGREGATION_ENABLED==='true');
  registerProviderCostDashboard(app,opsAccess,config,database);
  registerSpeedLimitRoute(app, database,Date.now,config.ADMIN_COVERAGE_AGGREGATION_ENABLED==='true');
  registerOfflineSafety(app,database,config);
  registerNotificationRoutes(app,database,config);
  registerAccountRoutes(app,database,options.driverAuth??supabaseProvider({url:config.SUPABASE_URL,publishableKey:config.SUPABASE_PUBLISHABLE_KEY,secretKey:config.SUPABASE_SECRET_KEY}),config.PLACES_STORAGE_SIGNING_KEY);
  registerIncidentRoutes(app, database, { ipHashKey: config.INCIDENT_IP_HASH_KEY, moderatorToken: config.NODE_ENV==='test'?config.ROVA_INCIDENT_MODERATOR_TOKEN:undefined, production: config.NODE_ENV === 'production',authorizeModerator:config.NODE_ENV==='test'?undefined:async request=>(await opsAccess(request,['reviewer','administrator'])).name,legacyReadOnly:config.NODE_ENV!=='test' });
  registerComplianceRoute(app, database, { enabled: config.COMPLIANCE_ALERTS_ENABLED === "true", transitions: config.COMPLIANCE_TRANSITIONS_ENABLED === "true", corridors: config.COMPLIANCE_CORRIDORS_ENABLED === "true", reportedRoads: config.REPORTED_ROAD_ALERTS_ENABLED === "true" });
  const usage=postgresUsage(database,config);
  registerPlacesRoutes(app, { provider: config.PLACES_PROVIDER, geoapifyKey: config.GEOAPIFY_API_KEY, token: config.MAPBOX_PLACES_ACCESS_TOKEN, permanentStorage: config.MAPBOX_PLACES_PERMANENT_STORAGE === "true", usage, storageKey:config.PLACES_STORAGE_SIGNING_KEY, dailyBudget: config.PLACES_DAILY_REQUEST_BUDGET });
  registerRoutingRoutes(app, { key: config.GEOAPIFY_API_KEY, usage, dailyBudget: config.ROUTING_DAILY_REQUEST_BUDGET });
  registerImportRoutes(app, database, config.NODE_ENV === "production" ? undefined : config.ROVA_ADMIN_IMPORT_TOKEN);
  return app;
}
