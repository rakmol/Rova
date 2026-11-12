# ROVA API and PostGIS foundation

The [operations dashboard](../admin/README.md) provides separate Supabase-backed admin roles, enforced MFA, immutable revision history, independent review and controlled publication. Migration 010 adds this workflow; no driver receives an admin role automatically.

Optional driver accounts are prepared using Supabase email OTP, but remain disabled until a dedicated ROVA project is configured. Guest Home/Work/favorites and privacy/voice settings work locally. See [ACCOUNTS.md](./ACCOUNTS.md) for migration009, owner authorization, provider activation, explicit sync, deletion/retry and tests.

Reviewed community hazards support region-based SSE updates and periodic fallback. See [REALTIME.md](./REALTIME.md) for timestamps, metrics, capacity, recovery, tests and the Ghana traffic-coverage/pricing decision. No live traffic provider has been enabled.

Community road-hazard reporting, nearby reports, confirmations and separate moderator review are available with migration 008. See [INCIDENTS.md](./INCIDENTS.md) for privacy rounding, expiry, API contracts, credentials, rate limits and the daily retention task. Readiness requires migration 009.

Unverified reported-road voice prompts are available separately from verified legal-limit alerts. See [REPORTED_ROAD_ALERTS.md](./REPORTED_ROAD_ALERTS.md) for migration 007, geometry associations, coverage, flags and corrections.

Real OSM road candidates can be inspected, staged and exported for evidence review with `npm run data:roads`. See [ROAD_DATA.md](./ROAD_DATA.md) for migration 006, the Ghana extract, local review map, licence, safeguards and the remaining field-verification work. Imported candidates never become approved rules automatically.

Driver-compliance alerts use `POST /safety/alert-context` and migration 005. See [SMART_ALERTS.md](./SMART_ALERTS.md) for evidence, route alignment, overspeed policy, flags, audio opt-out, tests and limitations.

Verified speed-limit lookup and road matching are implemented at `GET /safety/speed-limit`; see [SPEED_LIMITS.md](./SPEED_LIMITS.md) for migration 004, required GPS timestamp, review pipeline, applicability/priority policy, unknown reasons and tests. No authentic limit or camera database is imported automatically.

TypeScript/Fastify service with validated environment configuration, Zod request validation, Helmet security headers, explicit CORS origins, bounded request bodies, request IDs, sanitized structured logs and per-IP rate limiting. Existing licensed destination search, routing and draft-only official imports remain available. No provider credentials are returned to the mobile client.

## Local setup

Use Node 24/npm and a running Docker Desktop Linux engine. From the repository root:

```powershell
npm install
# Copy only if you do not already have this file; preserve existing provider keys.
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
npm run db:up
npm run dev:api
```

`db:up` waits for PostgreSQL, then runs all pending migrations. PostgreSQL 17/PostGIS 3.5 binds **127.0.0.1:54329**, with a named persistent volume. The compose credentials are explicitly local development values. They must not be used in production. `npm run db:down` preserves the volume. If Docker is using a stopped Windows/default engine, select its Linux context (`docker context use desktop-linux`) before these commands.

The API listens on `127.0.0.1:4000` by default; the existing development Expo bridge can reach it. Set `HOST=0.0.0.0` only when your intended hosting/network requires it. Ordinary API changes do not require an Android APK rebuild.

## Environment

| Variable | Behavior |
| --- | --- |
| `NODE_ENV` | development/test/production; default development |
| `PORT`, `HOST` | Validated listening port and address |
| `DATABASE_URL` | Required explicitly in production; local-only fallback in development/test |
| `DATABASE_SSL` | `true` enables certificate verification; configure trusted CA certificates through the runtime. URL TLS overrides are rejected when this is true. |
| `LOG_LEVEL` | Validated Pino level; no pretty-logger dependency |
| `CORS_ORIGINS` | Comma-separated exact origins. Development defaults to local admin origins; production defaults to none and requires HTTPS origins. CORS is not authorization. |
| `TRUST_PROXY_CIDRS` | Empty/false by default. Only explicit proxy IPs/CIDRs are accepted, so a client cannot choose its identity through arbitrary forwarded headers. |
| `RATE_LIMIT_MAX` | Default 120 requests/IP/minute, excluding stateless `/health`; 429 includes Retry-After. |
| `GEOAPIFY_API_KEY`, provider settings | Server-only search/routing credentials and budgets, described in mobile PLACES.md and ROUTING.md |
| `ROVA_ADMIN_IMPORT_TOKEN` | At least 32 characters, development/test imports only. The import endpoint is disabled in production even if this token is set. |
| `ALLOW_SYNTHETIC_SEED` | Explicit local demo seed opt-in; default false |
| `TEST_DATABASE_URL` | Explicitly disposable local database named `rova_test_*`; integration tests otherwise skip |

Keep `.env` private. Production must supply its own database login and credentials. `DATABASE_SSL=true` uses `rejectUnauthorized: true`; it never disables certificate verification. Database connection acquisition and statements are bounded. A separate migration/owner login should perform DDL; `db/roles.sql` optionally creates a NOLOGIN reader role with access to published views and migration metadata only. Assign managed login credentials outside source control.

The rate-limit store and provider budgets are **per process**, not shared across replicas or persistent across restarts. Configure a shared store/gateway limit before running multiple production instances. The development Metro bridge makes requests from one loopback IP, so connected phones share that limit. Search and routing also retain their stricter individual rate and provider-budget guards.

## API contract

OpenAPI 3.1 is available at **GET /openapi.json**. Requests and responses use JSON. All API replies carry an `x-request-id` and no-store policy, with Helmet headers. The request body limit is 1 MiB and incoming request timeout is 15 seconds. The provider adapters have their own calculation/network timeouts.

| Endpoint | Result |
| --- | --- |
| `GET /health` | 200 `{service:"rova-api",status:"ok"}`; process liveness remains independent of PostgreSQL |
| `GET /ready` | 200 `{status:"ready"}` only when PostgreSQL, PostGIS and migration 005 are present; otherwise 503 `{status:"not_ready",dependency:"database"}` |
| `GET /safety/speed-limit?lat=...&lon=...&heading=...&accuracy=...&vehicleType=...&timestamp=...` | Verified limit with source/review/audit references, or unknown/null with an explicit reason |
| `GET /routes?origin=lon,lat&destination=lon,lat` | Real configured Geoapify route options, geometry, distance, static duration estimates and located maneuvers. No route is an empty routes array. No live Ghana traffic claim. |
| `GET /v1/places/search?q=...&proximity=lon,lat` | Configured licensed provider search; no invented landmark results |
| `POST /v1/admin/speed-rules/import` | Authorized development/test import of real sourced records, **always draft**, never approval or publication |

Longitude comes first, in WGS84/EPSG:4326. Invalid/out-of-range input returns 400. Unknown request keys are rejected. A validation response uses `{error,code:"VALIDATION_ERROR",requestId,issues:[{path,message}]}` without echoing raw values. Global limits return 429, oversized bodies 413, and unexpected failures use a generic 500 response. Legacy provider errors retain their existing safe `{error}` contract. Read the request ID header on every error; raw PostgreSQL/upstream errors are not returned.

Imports require `Authorization: Bearer <local token>`. The body has `sourceAuthority`, `sourceDocument`, `sourceFileName`, `sourceFileSha256` (64 hex characters), and `records` (1–500 CSV-shaped records). Each record contains `source_reference`, `road_name`, `direction`, `vehicle_class`, `speed_limit_kmh`, `coordinates` (a JSON-encoded array of longitude/latitude pairs) and optional `source_url`, `source_published_at`, `effective_from`, `expires_at`. Existing directional/vehicle/source validation still applies. The import transaction links a normalized `data_sources` record, creates road/rule drafts and audit entries, and rolls everything back on a duplicate fingerprint (409). Do not send demo data to this official-data endpoint; use the guarded demo seed instead.

There are intentionally **no unauthenticated CRUD endpoints** for incidents, devices, tokens or moderation. This task establishes storage and validation boundaries, not a production identity/moderation API or push-delivery service. Organization authentication, authorization and review workflows must precede exposing those writes.

Logs contain request ID, HTTP method, static route pattern, status and duration. They omit query strings, destination coordinates, search text, bodies, auth/cookie headers and raw error messages. Automatic audit rows record entity, operation, actor and status; they do not copy whole spatial records, token ciphertext or report text into logs.

## Migration strategy

`npm run db:migrate` runs `src/db-cli.ts` with ordered SQL from `db/init`. Each migration is a transaction with its ledger entry in `schema_migrations`. A PostgreSQL advisory lock serializes concurrent runners. SHA-256 checksums, normalized to LF line endings, detect edits to applied migrations. Re-running an unchanged migration set is a no-op; failed DDL rolls back without advancing the ledger. **Add a new numbered migration; never edit an applied file.** Back up and review destructive future migrations before deploying them. No automatic down migration drops user data.

Fresh Docker volumes no longer execute untracked schema SQL through the image init directory; the tracked runner owns initialization. Existing volumes are preserved. For a database created by the earlier 001/002 init scripts without a migration ledger, inspect/backup the schema, then explicitly adopt the known baseline:

```powershell
npm run db:migrate -- --baseline-legacy
```

The runner checks for the legacy approval/import structures before baselining. Migration 003 renames the physical tables `speed_rules` → `speed_limit_rules` and `audit_events` → `audit_logs`, retaining legacy read views. New writes use the physical names; old `INSERT ... ON CONFLICT` statements must be updated. Existing source metadata is normalized, rows and reviewer records are preserved, and legacy approved/published speed rules return to `pending_review` because their newly normalized sources have not yet passed source review. Re-approve the source, road and rule through the review policy; the migration never fabricates verification metadata.

For deployment, build first and run `npm run db:migrate:prod --workspace @rova/api` with the migration owner's environment, then start the compiled service. Migrations are separate from normal API startup. Readiness blocks an incomplete database while liveness and independent provider proxies can remain available.

## Tables and spatial/data controls

| Table | Purpose and main constraints |
| --- | --- |
| `road_segments` | Nonempty valid 2D LineString/4326, positive length, direction, provenance, approval, validity and optional accuracy/confidence |
| `speed_limit_rules` | Road FK, vehicle/direction applicability, bounded speed, source evidence/fingerprint, validity, synthetic flag and existing two-independent-reviewer guard |
| `data_sources` | Official/field/provider/user-report/synthetic provenance, authority/document reference, source URL, license note, validity and independent source review |
| `enforcement_zones` | Valid Polygon/MultiPolygon/4326 with source, category, validity, accuracy/confidence and approval |
| `incident_reports` | Valid Point/4326, report type, observation/expiry, optional submitter/device, accuracy/confidence, provenance and moderation status |
| `incident_confirmations` | Confirmation/denial/resolution, one decision per report/device, optional user and accuracy |
| `users` | Optional external identity subject and lifecycle; no passwords or authentication provider implemented |
| `devices` | Random installation UUID, optional user, platform and explicit notification consent; no trip/location-history column |
| `push_tokens` | Device FK, provider, encrypted token bytes, external encryption-key ID, fingerprint, expiry/revocation. Encryption/key management and sending are not implemented here. |
| `audit_logs` | Append-only actor/entity/operation/reason/status metadata, with update/delete/truncate rejected |
| `moderation_actions` | Explicit reason, moderator actor, target and associated audit row |

GiST indexes cover each spatial table. Other indexes cover foreign keys, review queues, expiry and audit/moderation lookup. Spatial typmods enforce SRID/type; database checks also enforce 2D, validity, nonempty geometries and longitude ±180/latitude ±90. Confidence is 0–1; accuracy cannot be negative, infinite or NaN. Missing accuracy/confidence means unknown, not a guessed measurement. Timestamps use `timestamptz` and ranges must be ordered.

Approving/publishing a spatial record requires a real approved source, nonempty source reference, confidence and an independent reviewer/timestamp. Speed rules additionally require an approved road and two distinct approving reviewers excluding their creator. Editing approved content requires returning it to review. Source kinds and synthetic classifications cannot be relabelled to launder demo data. Review functions use a fixed trusted search path. Database owners remain trusted administrators who can manage schema/triggers; app roles should not be owners.

Driver-facing queries must use `published_road_segments`, `published_speed_limit_rules`, `published_enforcement_zones` and `published_incident_reports`. They filter approval, source approval, synthetic status and validity dates. Incident reports require an explicit unexpired expiry. Withdrawn/expired sources disappear from these views without deleting historical records. Confirmations alone never approve or verify an incident.

```mermaid
erDiagram
  data_sources ||--o{ road_segments : sources
  road_segments ||--o{ speed_limit_rules : governs
  data_sources ||--o{ speed_limit_rules : supports
  data_sources ||--o{ enforcement_zones : supports
  data_sources ||--o{ incident_reports : supports
  incident_reports ||--o{ incident_confirmations : receives
  devices ||--o{ incident_confirmations : submits
  users o|--o{ devices : owns
  devices ||--o{ push_tokens : registers
  audit_logs ||--o{ moderation_actions : records
```

## Synthetic demo seed

No demo data loads automatically. For the explicitly local `rova` database on loopback port 54329 only:

```powershell
$env:ALLOW_SYNTHETIC_SEED='true'
npm run db:seed:demo
Remove-Item Env:ALLOW_SYNTHETIC_SEED
```

The seed is idempotent and creates one source, one arbitrary segment near (0,0), and one **draft synthetic** speed rule. All names label it SYNTHETIC/NOT REAL. These are not Ghana landmarks or safety data. The CLI refuses production, remote hosts, other databases and ports; SQL also requires explicit development/test session flags. DB constraints/triggers prevent these records or their synthetic-source/segment descendants from becoming approved/published, and published views exclude them in every environment.

## Tests and verification

```powershell
npm run build --workspace @rova/api
npm test --workspace @rova/api
docker compose exec -T postgis createdb -U rova rova_test_foundation
$env:TEST_DATABASE_URL='postgres://rova:rova_local_only@127.0.0.1:54329/rova_test_foundation'
npm run test:db --workspace @rova/api
Remove-Item Env:TEST_DATABASE_URL
```

The integration suite **resets the public schema** of its explicit local `rova_test_*` database. It refuses other database names/remote hosts. Never point it at an application database. Tests cover actual PostGIS constraints, fresh/repeated/failed migrations, checksum drift, legacy baseline preservation, demo production guards, approval/publication exclusions, immutable audit logs, confirmation uniqueness and HTTP import atomicity. API tests cover environment parsing, Zod input errors, security headers, CORS, spoofed-forwarding behavior, 429/413 handling, fail-closed authorization and sanitized logs. Existing provider/import contract tests remain included.
