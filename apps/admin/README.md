# ROVA operations dashboard

Next.js/TypeScript dashboard for safety-data review. Basic mobile navigation remains available to guests; driver accounts never acquire operations privileges automatically.

## Start locally

From the repository root, with PostgreSQL/PostGIS and the API configured:

```powershell
npm run db:migrate --workspace @rova/api
npm run admin:grant --workspace @rova/api -- owner@example.com administrator
npm run dev --workspace @rova/api
npm run dev --workspace @rova/admin
```

Bootstrap finds an existing user in the configured ROVA Supabase Auth project. It does not create accounts, send email or assign other drivers privileges. Replace the example email with the real owner. All assignments are audited; the last active administrator cannot be demoted.

Private API configuration in `apps/api/.env`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`. The admin server only needs `ROVA_API_URL` (default `http://127.0.0.1:4000`); see `.env.example`. Never use `NEXT_PUBLIC_*` or mobile config for secrets. No Supabase SQL is needed for these tables: migration 010 runs on the configured ROVA PostgreSQL database.

Open `http://localhost:3010`. Sign in with the assigned Supabase account's email and password. No authenticator or email code is required. If the account has no password yet, configure one through Supabase's account recovery flow.

## Access boundaries

| Role | Permissions |
| --- | --- |
| viewer | Read records, geometry, revision history and aggregate analytics |
| reviewer | Viewer permissions plus approve/reject another author's revision |
| editor | Viewer permissions plus create/edit drafts and restore prior content |
| administrator | All permissions, reviewed publication, withdrawal and role assignment |

Every data request validates the signed token with the configured Supabase project, its issuer/expiry, active membership and registered unrevoked session. Operations data accepts a registered password-login session; an authenticator code is not required. Membership is separate from driver identity and developer import credentials. Disabling membership takes effect on the next request. Sign-out revokes all ROVA admin sessions for that identity; it does not sign the driver app out globally.

The Next server holds the access token in HttpOnly, SameSite Strict cookies scoped to `/api/ops`; tokens are not returned to browser JavaScript. Production cookies require HTTPS. Sessions are not refreshed silently: sign in after provider expiry or four hours, whichever comes first. Mutations require exact same Origin and a custom header. Login have separate rate limits. Request logs exclude passwords, tokens and raw GPS query strings.

Production requires an HTTPS admin origin and HTTPS API, or private loopback API on the same machine. Keep database/API credentials server-side and restrict direct SQL access. Use a restricted application database role. Database owners/superusers remain trusted operators who can change schema/guards. These source changes do not deploy hosting.

## Screens and publication

Overview shows database review counts. Hazards, roads, speed rules, enforcement zones and sources have searchable paginated tables and record review. Road candidates are read-only unapproved evidence. Source freshness highlights expired/missing/old evidence. Analytics counts moderation actions and categories, not driver journeys or traffic. Audit trail contains immutable before/after changes and comments. Sponsored moderation/publication is disabled.

Geometry previews support points, lines, polygons and zoom without another map service. These views have no street basemap and cannot establish whether a speed sign/camera exists. WGS84 GeoJSON uses `[longitude, latitude]`. Mapping candidates include OpenStreetMap attribution; respect ODbL when exporting/combining OSM evidence.

1. Create a source draft with authority, URL/document reference, license, publication/effective/expiry dates. The JSON editor follows strict API schemas; unknown fields are rejected.
2. Safety sources, roads, limits and zones require **two independent reviewers**, excluding the revision author and original creator. Community hazards require one. Administrators may review others' work, never their own.
3. An administrator publishes explicitly. Current content, approval age, provenance, dates, synthetic flags and accuracy/confidence are checked again. Publish a source and road before a dependent speed rule. Zones require official evidence; reported areas do not become verified cameras.
4. Editing immediately returns content to review. Old approvals cannot publish it. Revision checks prevent concurrent overwrites. A rejection blocks publication; corrections require a new revision.
5. Restore creates a **new unpublished revision** linked to the reverted revision. Old approvals never return. Withdraw removes production eligibility immediately.

Every revision records author, before/after, effective/expiry dates, comment and time. Reviews/action logs are append-only; triggers reject mutation/truncation. Existing public safety filters remain. The migration installs no real limits/cameras and no reviewer identities. Assign real reviewers through **Admin roles**, using their Supabase Auth UUIDs, before publication.

Community positions stay rounded with approximately 150 m uncertainty; private reporter identifiers are excluded from snapshots. Reviewed community hazards remain community evidence, never authority-verified. Dynamic vote confidence is separate from editable facts. Shared-token moderation writes are retired outside automated tests.

## Coverage privacy and retention

`ADMIN_COVERAGE_AGGREGATION_ENABLED=false` by default. Enabling it counts unknown speed-limit requests by day, reason and approximately 5 km cells, with no identities or exact fixes. Only cells with at least 10 requests in the last 30 days appear. These are request counts, not unique drivers or traffic measurements. Provide an appropriate privacy notice before enabling.

Run daily when enabled; also removes expired/revoked admin sessions:

```powershell
npm run admin:maintenance --workspace @rova/api
```

Safety revisions/audit evidence have no automatic deletion job. Define restricted access and a retention policy before production; avoid personal information in evidence comments.

## Verification

```powershell
npm run typecheck --workspace @rova/api
npm run build --workspace @rova/admin
$env:TEST_DATABASE_URL='postgres://rova:rova_local_only@127.0.0.1:54329/rova_test_foundation_20261108'
npm test --workspace @rova/api
Remove-Item Env:TEST_DATABASE_URL
npx playwright install chromium
npm run test:e2e --workspace @rova/admin
```

Integration tests reset only an explicit existing local `rova_test_*` schema. Browser tests create/reset `rova_test_admin_e2e_20261109` on loopback port 54329, start a real isolated API on 4101 and Next on 3002, and inject fake auth **only in the test fixture**. No test users, approvals or sample safety records enter the app DB or real Supabase project. Coverage includes password-only login/RBAC, CSRF, token-cookie privacy, independent publication, public lookup exclusion, edit/revert, hazards, immutable audit and mobile layout.

The owner's actual password and email recovery delivery are not verified by fake-auth tests; sign in with the real account to check them.
# Prelaunch sponsorship preparation

`Sponsored draft review` uses the normal role-protected revision, independent review,
withdrawal and revert workflow for local businesses. Publication is locked in both
the API and database. Positive reviews never activate ads. `Sponsorship plan & analytics`
shows proposed pricing, targeting/consent and privacy-limited reporting; event collection,
advertiser access, billing and public ad delivery remain disabled.
See [the sponsorship design and release gates](../../SPONSORSHIP.md).
# Provider cost audit (read-only)

`Provider costs & audit` shows current backend daily limits, direct-client blind spots,
monthly reference totals and existing degraded states. Actual provider usage/spend and
monthly enforcement remain unknown/unconfigured; alert delivery is not enabled. The
monthly calculator is a hypothetical in-memory illustration, not an invoice or saved
provider setting. No API keys, tokens or billing credentials are returned.
See [the ranked audit and proposed fixes](../../audit/2026-11-11/REPORT.md) and
[provider terms/cost review](../../audit/2026-11-11/PROVIDERS.md). Remediation and any
new quota enforcement require approval under the user's “agreed fixes only” instruction.
