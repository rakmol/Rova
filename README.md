# ROVA

Android CI, signing/build profiles, privacy preparation, physical testing and rollout are documented in [release/README.md](release/README.md). Native cloud builds are manual and disabled until explicitly enabled; no store publication is automated.

The PostgreSQL/PostGIS backend foundation is documented in [apps/api/README.md](apps/api/README.md): tracked migrations, local Docker setup, environment/configuration, security controls, API/OpenAPI contracts, synthetic-demo isolation and real database tests.

ROVA is an Android-first Ghana navigation and road-safety app. The first launch target is Accra. This is a working development foundation, not a production safety or navigation service.

## Monorepo

- `apps/mobile` — Expo SDK 58, React Native 0.88, Expo Router, Mapbox Maps, destination search, route previews, and a Mapbox Navigation SDK integration.
- `apps/api` — Fastify API, PostgreSQL client, import validation, health/readiness endpoints, and draft-only official speed-rule imports.
- `apps/admin` — Next.js operations dashboard with a manually operated official-data CSV import page.
- `packages/shared` — TypeScript contracts shared across workspaces.
- `packages/ui` — shared safety notices and palette for native and web.
- `apps/api/db/init` — ordered PostgreSQL/PostGIS initialization SQL. It defines data storage and review controls, but contains no Ghana road records.

The Map tab uses configured native map tiles and API-backed destination search/route estimates. ROVA guidance, GPS progress, voice and rerouting are experimental pending real Accra road validation. A custom Android build is required for native map modules. Live traffic is disabled until Ghana coverage/licensing is verified. Unknown speed limits and unverified reports remain explicitly labelled; provider maps/directions are separate from approved ROVA safety data.

## Environment and run locally

Requirements:

- Node.js 24.13.0 and npm 11.6.2 (pinned in .nvmrc / package.json).
- Docker Desktop with its Linux engine for PostgreSQL/PostGIS.
- Android Studio, Android SDK, and a compatible JDK for local Android builds, or an EAS account for cloud builds.
- A Mapbox account and public access token (`pk.…`) to use live map tiles, search, and navigation.

Check Docker, Java and Android SDK/ADB on the machine you actually use. Cloud Expo builds do not require a local Android SDK; the API/database still need their own running services. See the release runbook for pinned tools and build costs.

From the repository root in PowerShell:

```powershell
npm install
npm run db:up
```

`db:up` waits for the local database and applies tracked migrations. For later changes on an already tracked database:

```powershell
npm run db:migrate
```

For legacy volumes initialized by the original 001/002 SQL scripts, inspect and back up the schema before following the explicit `--baseline-legacy` procedure in [the API guide](apps/api/README.md). Do not delete a volume to apply schema changes; migrations preserve its data.

Start services in separate terminals:

```powershell
npm run dev:api
npm run dev:admin
npm run dev:mobile
```

- API liveness: `http://localhost:4000/health`; readiness (requires PostGIS): `http://localhost:4000/ready`.
- Admin: `http://localhost:3000`.
- Expo prints the development server URL/QR code.
- `npm run db:down` stops the database container but retains its named volume.

Without a Mapbox token, the app still opens but shows an explicit map/search setup state. To configure Mapbox and launch on Android, follow [apps/mobile/README.md](apps/mobile/README.md).

## Mapbox credentials and Android build

1. Create a Mapbox account and a **public** access token beginning with `pk.`. Use separate tokens for development and production, with only the scopes required by Maps, Search Box, and Navigation. A public token is embedded in the app binary and can be extracted; it is not a secret.
2. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`. Never use an `sk.…` secret token in the mobile app or commit `.env`. The Maps and Navigation React Native packages do not require a secret downloads token.
3. Keep `EXPO_PUBLIC_MAPBOX_TRAFFIC_ENABLED=false` until route/traffic availability and ETA quality have been verified in Ghana. Do not infer Ghana speed limits from Mapbox speed annotations.
4. Rebuild the Android development client after changing native SDK configuration or token. Metro reloads cannot change the installed native binary.

For EAS, configure `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` as a development environment variable in the EAS project, then build:

```powershell
npm install --global eas-cli
eas login
cd apps\mobile
eas build:configure
eas build --platform android --profile development
```

Install the EAS build on the phone, return to the repository root, and run `npm run dev:mobile`. Keep the phone and computer on the same Wi-Fi network and allow Node/Expo through the Windows firewall if prompted. For a local Android build, install Android Studio/SDK and a compatible JDK, enable USB debugging, then run `npx expo run:android` from `apps\mobile`. Expo Go cannot load these native Mapbox SDKs.

Mapbox Maps, Search Box, Directions, and Navigation usage is subject to Mapbox's current billing and terms; usage may be billed separately by product. Review [Mapbox pricing](https://www.mapbox.com/pricing), set usage alerts/limits where available, and do not assume production usage is free. Search and route requests send the entered destination and location to Mapbox. Search results are used transiently and are not saved by this app.

## Routing and navigation constraints

- Search uses the Mapbox Search Box `/suggest` + `/retrieve` flow, limited to Ghana and biased toward Accra or the current foreground location. Availability and result quality in Accra still require real-device validation.
- Route options use Geoapify through `GET /routes`, with supported preferences, deduplicated alternatives and MapLibre polylines. See [routing configuration, costs and limits](apps/mobile/ROUTING.md). Guidance now follows the selected route using foreground GPS, guarded rerouting, pause/resume and device speech synthesis; see [session behavior, tests and road-validation limits](apps/mobile/NAVIGATION.md). The earlier native-only guidance screen has been replaced.
- The route profile is `driving`, without live traffic. The app ignores the traffic environment toggle while Ghana coverage remains unverified; all ETA values are labelled estimates.
- The official Mapbox Navigation native SDK is wrapped by [`@rnmapbox/navigation`](https://github.com/rnmapbox/navigation), a community-maintained **pre-1.0** React Native package (currently 0.1.2), not an official Mapbox React Native product. It is documented as tested with Expo SDK 58, requires React Native 0.79+ with the New Architecture, Maps React Native 10.3.x, native Maps SDK 11.33.0, Android min SDK 24 / compile SDK 36, and a custom build. It supports live guidance, spoken instructions, route progress, off-route detection, rerouting, and ETA. A physical-device build and drive test are still required before relying on it.
- The navigation screen intentionally does **not** show Mapbox's speed-limit annotations. Only approved ROVA speed rules may provide the ROVA speed-limit badge. Accident, hazard, and enforcement records remain separate ROVA/PostGIS data.
- The app requests foreground location. The Navigation SDK handles location during an active guidance session; background behavior and Android notification requirements must be verified on device. No always-on location is requested.

## Verified speed-limit data and admin import

Migration `002_verified_speed_rule_imports.sql` extends the existing PostGIS road segments and rules with direction, provenance, source fingerprints, import batches, and review approvals. It requires two distinct approvers (neither the creator) before a rule can become approved or published. The API import at `POST /v1/admin/speed-rules/import` validates the request, saves a batch and audit events transactionally, deduplicates by source fingerprint, and creates only `draft` records. It never publishes imported data.

Existing legacy `reviewed` rules, and any old publications without the new source and two-reviewer evidence, are moved to `pending_review` by the migration so they cannot silently remain driver-facing under the stricter policy.

The admin page at `http://localhost:3000/import` accepts a CSV based on `apps/admin/public/speed-rules-import-template.csv`. Provide the issuing authority and document identifier and transcribe only official, verifiable information. Each row needs its source reference, road name, direction (`forward`, `reverse`, or `both`), applicable vehicle class, speed-limit value, WGS84 road-segment coordinates, and applicability dates when known. The API rejects invalid coordinates, unsupported values, and missing provenance. No sample Ghana limits are included.

The current bearer-token gate is for local development only, not production authentication:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$env:ROVA_ADMIN_IMPORT_TOKEN = 'paste-the-generated-value-here'
npm run dev:api
```

Use the same token in the admin import form. Keep it private and do not commit it. Mapbox search and navigation use the mobile public token; no Mapbox secret or Places/Routes server key is configured. A real deployment must replace this shared import token with authenticated role-based access, MFA, individual reviewer identities, and production-grade audit controls before any imports or review actions are exposed.

## Dependency choices

- **Expo / React Native / TypeScript** provide the Android-first client, native build workflow, and type safety; **Expo Router** provides file-based app navigation.
- **`@rnmapbox/maps` 10.3.17** provides Mapbox Maps SDK 11.33.0 rendering; **`@rnmapbox/navigation` 0.1.2** wraps the native Mapbox Navigation SDK for guidance, voice, GPS, rerouting, and ETA. The navigation wrapper is pre-1.0 and requires a custom native build.
- **`expo-location`** provides user-consented foreground location for the map and route previews. The Navigation SDK manages location during active guidance.
- **Fastify**, **`@fastify/cors`**, and **`pg`** provide the API server, local admin-origin access, and PostgreSQL connectivity.
- **PostgreSQL + PostGIS** store future road geometries, provenance, review records, and audit events. Docker Compose keeps the local database reproducible.
- **Next.js / React** provide the separate admin app; **Papa Parse** parses the user-selected CSV locally for preview before API validation.
- **`@rova/shared`** and **`@rova/ui`** keep contracts and safety UI shared across workspaces.
- **`tsx` / TypeScript** support API development and checks. Expo's native peers provide platform UI, navigation, gestures, and animations.

## Checks

```powershell
npm run typecheck
npm run build
npm run test --workspace @rova/api
npm run lint --workspace @rova/mobile
npm run test --workspace @rova/mobile
```

Run Expo-specific checks from the mobile workspace:

```powershell
cd apps\mobile
npx expo install --check
npx expo-doctor
```

The SQL initialization and API persistence require a running PostgreSQL/PostGIS container. Live Mapbox tiles, search, routes, and navigation require a public Mapbox token and a custom Android build. Navigation behavior and Accra traffic/search coverage still need on-device verification.

## Next milestone

Add a restricted public Mapbox token, build/install the Android development client, and test Accra map rendering, search, GPS permission denial/grant, voice instructions, route progress, arrival, and rerouting on a real device. Verify Ghana traffic coverage before enabling traffic routing or labeling an ETA traffic-aware. Separately obtain an official government road-speed publication and exercise the CSV workflow against local PostGIS, then document two-person review with real reviewer identities. Do not seed illustrative safety data or expose imports in production before authentication and review controls are ready.
# QA and safety acceptance

See [the QA strategy](qa/STRATEGY.md), [requirement-to-test matrix](qa/TRACEABILITY.md)
and [unexecuted field evidence template](qa/field-template.json). `npm run qa:run`
collects hashed automated evidence; release acceptance remains NO-GO until exact-build
physical-device/road, security, language and production-monitoring evidence is reviewed.
