# ROVA hosted backend

Target: existing Vercel account `msofficemay2023-2341`, team `girliehood`, project `rova-api`; new dedicated Supabase project `qmdbvjuezizdfjepgwag`. No paid upgrade, purchased domain or Firebase activation is part of this setup.

The build bundles the API and shared workspace TypeScript into `dist/serverless.mjs`, keeping published Node dependencies external. A native-Node import test guards against unresolved workspace sources. No secret environment values are substituted into the bundle.

The API runs in a Node24 Vercel Function using the existing Fastify application. A warm instance shares one application and bounded PostgreSQL pool. Requests use the same authenticated/validated routes as local development. Supabase provides PostgreSQL/PostGIS and optional Auth. The database URI, CA, server keys and cron secret stay in private configuration/Vercel sensitive environment variables; mobile builds receive only public endpoint URLs and their existing public map token.

Source files: `apps/api/api/index.js`, `scripts/build-api.mjs`, `src/serverless.ts`, `src/database.ts`, `src/hosting.ts`, `vercel.json`, and migration015. The Vercel project root is `apps/api`, with workspace dependencies available from the repository root. Never upload local `.env` files, credentials, private evidence or generated native projects.

## Database and privacy

Apply checksum-verified migrations through the **session pooler** on5432, with the Supabase CA and hostname validation enabled. Transaction pooling does not preserve the migration runner's session advisory lock. Runtime connections also use verified TLS; pool size is explicitly bounded. Do not set `rejectUnauthorized:false` or disable TLS to work around a missing CA.

The existing schema expects PostGIS in `public`. Supabase recommends a separate extension schema; this is a known compatibility limitation, not a claim of following that recommendation. Migration015 explicitly removes PUBLIC/anon/authenticated/service_role access to the ROVA relations, private safety functions and public PostGIS reference table so direct Data API access cannot bypass backend authorization. The application uses a private PostgreSQL credential; Auth remains separate in Supabase's own schema. Test direct table/view/RPC denial after migration and retain the separate production security review. Do not move an already installed PostGIS extension automatically or run against a project containing unrelated public tables.

Only real existing review-stage map batches/candidates, **unverified** reported-road advisories/associations, anonymous installation/session controls and provider quota ledgers are eligible for the initial transfer. Preserve their source/license/provenance and verification labels. Do not copy synthetic road/limit seed records, old-project administrator sessions or pretend map candidates are official speed rules. No verified safety corridor is created by hosting. The new Auth project has its own identities; old-project sign-in sessions cannot authenticate to it.

Private transfer evidence belongs in ignored `qa/evidence`, with counts only in ordinary logs. Never attach an account/data dump, route history, API key or connection URI to GitHub.

## Scheduled maintenance

`GET /internal/maintenance` requires exact Bearer `CRON_SECRET`; missing/wrong credentials return404 before database access. Vercel calls it daily at the configured02:15 UTC/Africa-Accra schedule. Hobby scheduling is approximate, so do not promise precise execution. A durable per-day claim prevents overlapping or repeated completed work. A stale/failed claim can be retried after two minutes with the same private operator credential; never put that credential in a URL or browser bundle.

The job expires/prunes community report associations, abuse/session rows, old admin sessions, coarse coverage, diagnostic contributions and expired leases, then retries up to two due account-provider deletions within a bounded budget. The small free pilot configuration therefore retries deferred account jobs daily, not every five minutes; immediate account deletion is still attempted by its request handler. A larger cohort/outage backlog requires more frequent scheduling and appropriate service capacity before launch. `hosting_maintenance_runs` stores aggregate counts/status, not identity or movement data. A configured cron and successful manual smoke test do not prove a later scheduled invocation happened: inspect the actual heartbeat/logs after the scheduled run.

Firebase/remote push delivery remains disabled. Existing local renewal reminders do not depend on this scheduler. Do not enable push merely because the API is hosted: configure credentials, a timely queue worker and delivery/receipt monitoring separately.

## Verification and rollout

1. Verify the new project/keys, inspected database, target Vercel account/team/project and reviewed commit.
2. Apply migrations, verify source labels, direct Data API denial and known-vs-unknown safety rules. Keep telemetry off and pilot corridor gating on.
3. Populate sensitive preview/production runtime settings, deploy and test the function using the returned URL. Check public production access for guests, authenticated routes, health/readiness, search, routes, expired/unknown safety and cron authorization. Preview protection must not be confused with production app authentication.
4. Inspect build/runtime output for missing workspace modules and secret leakage; confirm the runtime pool does not exhaust the Supabase connection allowance. Verify idle/cold start, reconnecting45-second SSE streams and periodic-refresh fallback on an actual phone.
5. Set mobile public search/routing/compliance/incidents/account/pilot endpoints to the tested permanent **production alias**. An already installed standalone APK keeps its previous bundled URLs until an appropriate tested rebuild/update; changing a local env file does not update it by itself. Admin web hosting, if added separately, should point `ROVA_API_URL` to the same origin.
6. Keep physical-device/road/provider/legal/operations acceptance open. A reachable backend does not turn the [pilot readiness](../pilot/READINESS.md) into GO.

Current account is Hobby: intended for personal/non-commercial use and shared account quotas; commercial launch needs an eligible plan. Supabase free service may pause inactive projects and has limited database/storage/backup resources. This setup removes dependence on a running PC, but is not a24/7 uptime/backup/SLA guarantee. No automatic paid upgrade is authorized. Review provider account usage and reconcile any local developer requests separately from the hosted ledger.

References: [Fastify serverless integration](https://fastify.dev/docs/latest/Guides/Serverless/), [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [SSL](https://supabase.com/docs/guides/platform/ssl-enforcement), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
