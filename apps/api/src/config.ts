import { isIP } from "node:net";
import { z } from "zod";
const budget = (value: number) => z.coerce.number().int().min(0).max(1000000).default(value);
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"), PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url().refine((value) => { try { return ["postgres:", "postgresql:"].includes(new URL(value).protocol); } catch { return false; } }).optional(),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z.string().optional(), TRUST_PROXY_CIDRS: z.string().default("").refine((value) => !value || value.split(",").every((part) => {
    const parts = part.trim().split("/"); const [address, prefix] = parts; const family = isIP(address);
    return parts.length <= 2 && family !== 0 && (prefix === undefined || (/^\d+$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128)));
  })),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(10000).default(120),
  PUSH_DELIVERY_ENABLED:z.enum(['true','false']).default('false'),
  EXPO_PUSH_ACCESS_TOKEN:z.preprocess(v=>v===''?undefined:v,z.string().min(20).optional()),
  NOTIFICATION_TOKEN_KEY:z.preprocess(v=>v===''?undefined:v,z.string().regex(/^[a-fA-F0-9]{64}$/).optional()),
  NOTIFICATION_TOKEN_KEY_ID:z.string().min(1).max(50).default('push-v1'),
  ADMIN_COVERAGE_AGGREGATION_ENABLED: z.enum(['true','false']).default('false'),
  PILOT_TELEMETRY_ENABLED:z.enum(['true','false']).default('false'),
  PILOT_REGION_GATING_ENABLED:z.enum(['true','false']).optional(),
  OFFLINE_SAFETY_ENABLED:z.enum(['true','false']).default('false'),
  OFFLINE_SAFETY_SOURCE_IDS:z.string().default('').refine(v=>!v||v.split(',').length<=100&&v.split(',').every(id=>z.uuid().safeParse(id).success),'Explicit licensed source UUID allowlist required'),
  SUPABASE_URL: z.preprocess(v=>v===''?undefined:v,z.url().refine(v=>/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v),'Use your hosted Supabase project HTTPS origin').optional()),
  SUPABASE_PUBLISHABLE_KEY: z.preprocess(v=>v===''?undefined:v,z.string().min(20).optional()),
  SUPABASE_SECRET_KEY: z.preprocess(v=>v===''?undefined:v,z.string().min(20).optional()),
  INCIDENT_IP_HASH_KEY: z.preprocess(v=>v===''?undefined:v,z.string().min(32).optional()),
  ROVA_INCIDENT_MODERATOR_TOKEN: z.preprocess(v=>v===''?undefined:v,z.string().min(32).optional()),
  COMPLIANCE_ALERTS_ENABLED: z.enum(["true", "false"]).default("true"),
  COMPLIANCE_TRANSITIONS_ENABLED: z.enum(["true", "false"]).default("true"),
  COMPLIANCE_CORRIDORS_ENABLED: z.enum(["true", "false"]).default("true"),
  REPORTED_ROAD_ALERTS_ENABLED: z.enum(["true", "false"]).default("true"),
  PLACES_PROVIDER: z.enum(["mapbox", "geoapify"]).default("mapbox"),
  PLACES_STORAGE_SIGNING_KEY:z.preprocess(v=>v===''?undefined:v,z.string().min(32).optional()),
  PROVIDER_USAGE_SCOPE:z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/).default('rova'),
  PROVIDER_SEARCH_MONTHLY_LIMIT:budget(31000),PROVIDER_ROUTING_MONTHLY_LIMIT:budget(9300),
  PROVIDER_GEOAPIFY_RPS:z.coerce.number().int().min(1).max(5).default(5),
  GEOAPIFY_API_KEY: z.string().optional(), MAPBOX_PLACES_ACCESS_TOKEN: z.string().optional(),
  MAPBOX_PLACES_PERMANENT_STORAGE: z.enum(["true", "false"]).default("false"),
  PLACES_DAILY_REQUEST_BUDGET: budget(1000), ROUTING_DAILY_REQUEST_BUDGET: budget(300), ROVA_ADMIN_IMPORT_TOKEN: z.string().optional(),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid API configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
  const config = parsed.data;
  if (config.NODE_ENV === "production" && !config.DATABASE_URL) throw new Error("DATABASE_URL is required in production.");
  if(config.NODE_ENV==='production'&&config.DATABASE_URL){const url=new URL(config.DATABASE_URL),hosts=[url.hostname,...url.searchParams.getAll('host'),...url.searchParams.getAll('hostaddr')];if(hosts.some(host=>!['localhost','127.0.0.1','[::1]'].includes(host))&&config.DATABASE_SSL!=='true')throw new Error('Verified TLS is required for a remote production database.');}
  if (config.ROVA_ADMIN_IMPORT_TOKEN && config.ROVA_ADMIN_IMPORT_TOKEN.length < 32) throw new Error("ROVA_ADMIN_IMPORT_TOKEN must contain at least 32 characters.");
  if (config.DATABASE_SSL === "true" && config.DATABASE_URL && ["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "sslnegotiation", "uselibpqcompat"].some((key) => new URL(config.DATABASE_URL!).searchParams.has(key))) throw new Error("Use DATABASE_SSL and trusted CA configuration rather than overriding TLS in DATABASE_URL.");
  const origins = config.CORS_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? (config.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"]);
  for (const origin of origins) {
    try { const url = new URL(origin); if (url.origin !== origin || !["http:", "https:"].includes(url.protocol) || (config.NODE_ENV === "production" && url.protocol !== "https:")) throw new Error(); }
    catch { throw new Error("CORS_ORIGINS must contain explicit origins; production requires HTTPS."); }
  }
  return { ...config, PILOT_REGION_GATING_ENABLED:config.PILOT_REGION_GATING_ENABLED??(config.NODE_ENV==='production'?'true':'false'), DATABASE_URL: config.DATABASE_URL ?? "postgres://rova:rova_local_only@127.0.0.1:54329/rova", corsOrigins: origins, trustProxy: config.TRUST_PROXY_CIDRS ? config.TRUST_PROXY_CIDRS.split(",").map((value) => value.trim()) : false as false };
}
export type ApiConfig = ReturnType<typeof readConfig>;
export function assertDemoSeedAllowed(config: ApiConfig, allow = process.env.ALLOW_SYNTHETIC_SEED) {
  const url = new URL(config.DATABASE_URL);
  if (config.NODE_ENV === "production" || allow !== "true" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/rova" || url.port !== "54329") throw new Error("Demo seed is restricted to the opted-in local rova database on port 54329.");
}
