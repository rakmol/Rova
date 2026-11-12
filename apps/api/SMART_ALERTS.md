# ROVA TraffiTech Smart Alert: driver compliance

At the user's request, navigation also supports a separate **unverified reported-road prompt** where a reported name has a mapped road shape. This can work while the legal limit is unknown, and does not create an official camera or speed-limit record. See [REPORTED_ROAD_ALERTS.md](./REPORTED_ROAD_ALERTS.md).

This is ROVA's feature name, not a claim of authority affiliation or access to an official TraffiTech database. **No real enforcement records or speed limits are imported or invented.** Empty data means unavailable/unverified, never no enforcement or permission to speed. Road signs and traffic rules take priority. Actual Accra road/GPS validation remains necessary before operational reliance.

## API and setup

Apply migration `005_driver_compliance_alerts.sql` with `npm run db:migrate`. Readiness requires 005. `POST /safety/alert-context` accepts:

```json
{
  "fix": { "lat": 5.6037, "lon": -0.187, "heading": 90, "accuracy": 5, "timestamp": 1794096000000, "vehicleType": "private_car" },
  "path": [[-0.188, 5.6037], [-0.182, 5.6037]]
}
```

These illustrative coordinates/time do not identify a verified road or enforcement location. Use the original current GPS timestamp. Supported vehicle classes match `/safety/speed-limit`; choose one in app Settings before driving. Default is private car, retained for the app session. Routing remains general driving guidance, not a vehicle-restriction routing engine.

The selected route fragment contains 2–128 vertices, maximum 1,500 m. The app sends roughly 80 m behind and 650 m ahead, preserving bends; excessively dense geometry becomes unavailable. Body limit 32 KiB; 40 requests/IP/minute. App requests are at least two seconds apart, one at a time, with a 4.5-second timeout. Coordinates/route fragments are processed transiently and not stored; logs omit bodies and coordinates. Configure production HTTPS and applicable privacy notices.

The `ComplianceContext` response binds its original fix timestamp/coordinate, `checkedAt`, `validUntil` and `validForMeters` to a current verified limit or unknown/null, route-relative upcoming notices and enforcement status. The device accepts proof for at most three seconds and 20 m of movement/progress, heading within 15 degrees of the request. Near segment boundaries and effective/expiry changes, validity is shorter. Bad GPS, new routes, interrupted navigation, errors and cancellation discard context. Future target-road inspections never replace the current GPS limit. Notices contain source/review references and distances, **no camera coordinates**.

Current limits use all section-09 verification and ambiguity gates. GPS needs known travel heading and accuracy within 25 m. Upcoming events require the reviewed entry and initial 30 m of travel to align within 5 m of the selected route, tangent within 30 degrees, geographic direction ahead, no route-loop ambiguity, and separation from boundary uncertainty. More than 16 candidates suppresses upcoming notices. A current verified limit is required even for corridor notices. This conservative policy can miss alerts and never establishes complete coverage.

## Evidence and review

Operators load documented records as drafts using controlled database tooling; there is no public event-writing API. `driver_compliance_events` stores WGS84 traversal geometry, approach/target road references, kind/type, accuracy, confidence, permanent synthetic classification, official source/reference, confirmed applicability, explicit effective/expiry dates, creator, two independent reviewers, review dates and revision. Transitions pin a target-rule revision; corridors link an official polygon zone.

Publication requires two distinct reviewers independent of the creator, real published roads, approved official provenance, confidence >=0.95, known positional accuracy <=10 m and reviews within 180 days. Sources require review within 365 days. Transition geometry must follow the target road and join its boundary to an approach-road endpoint. The API re-verifies the current target-rule revision and applicable vehicle-specific limit using the section-09 matcher. Superseded, conflicting, stale or unverified target evidence produces no warning.

Corridor paths must follow the reviewed target road and be covered by a current published non-synthetic official zone with confidence >=0.95, accuracy <=10 m, independent approval and explicit validity dates. Withdrawn/expired sources or zones disappear at the next lookup. Material event changes require leaving publication, increment revision and clear both reviews. Audit logs record event operations. `rova_reader` receives only bounded candidate-function execution; apply updated `db/roles.sql` for separately provisioned reader identities.

Enforcement metadata supports `fixed_speed`, `average_speed`, `red_light`, `combined`, `checkpoint`, `unknown`. A named type requires documented evidence; otherwise use unknown. Average-speed metadata describes sourced corridor type; the app does not calculate legally admissible average speed or provide an evasion timer. Mobile-camera types and unofficial precise mobile-camera records are unsupported. Do not turn rumors or crowd reports into this evidence.

## State, prompts and audio

The pure mobile `SmartAlertEngine` has unavailable, monitoring, pending and overspeed states. GPS speed is displayed separately from the verified limit. Overspeed requires more than `limit + max(3 km/h, 5%)` for at least five seconds and three distinct fixes, without a sampling gap over 2.5 seconds. This noise tolerance is **not a legal allowance**. Recovery occurs at or below `limit + 1 km/h`; hysteresis avoids chatter. Missing speed, bad GPS, lost evidence, a changed road/limit or navigation interruption resets sustained detection. Duplicate timestamps never accumulate time/samples.

Overspeed prompts repeat at most once per 30 seconds. All smart prompts share a 12-second cooldown. Upcoming warnings occur about 30–400 m ahead once per event/revision/session. Entry/exit use 20 m hysteresis; passed events do not rearm on GPS jitter. Session memory is bounded, never persisted. Maneuver speech has priority and smart prompts wait near turns (<80 m). Navigation and smart alerts use the same cancellable voice player.

When a fresh GPS fix exceeds cached movement validity while a replacement lookup is in flight, the screen remains unavailable and no smart prompt is emitted. The pending streak can survive this revalidation only while proof is unexpired, GPS/heading/speed remain reliable and successive verified fix timestamps stay within 2.5 seconds. Unknown responses or expired proof reset it. Unverified intermediate fixes never increment sustained samples or emit warnings. This prevents ordinary lookup latency from continually restarting the detector.

Prompts: “Speed limit ahead: 50 kilometres per hour”; “Please slow down safely”; “Approved enforcement corridor ahead. Follow road signs and traffic rules.” No sudden-braking instruction, camera countdown or coverage guarantee is given. The separate alert-sound switch opts out of smart speech while retaining visual compliance. It is session-only and does not replay consumed warnings on opt-in. Existing voice mute silences all speech. Foreground/background interruption handling remains in place; this feature adds no background tracking.

Strict short-lived proof can produce unavailable gaps and suppress sustained alerts during fast movement/slow connectivity. Curves, junctions, uncertain road levels, missing data, dense route geometry and unknown heading can suppress events. Only the reviewed approach/initial traversal is validated, not lane-level coverage or an entire long corridor. If an exit cannot align inside the bounded route fragment, only the validated traversal extent is exposed; later lookups may become unavailable rather than extrapolate. This is not an exhaustive compliance detector.

## Flags and deployment

Server switches (strict true/false, default true): `COMPLIANCE_ALERTS_ENABLED`, `COMPLIANCE_TRANSITIONS_ENABLED`, `COMPLIANCE_CORRIDORS_ENABLED`. Master-off returns unknown/no notices without database reads; subflags gate upcoming categories. Restart the API for environment changes.

App switches: `EXPO_PUBLIC_COMPLIANCE_ALERTS_ENABLED`, `EXPO_PUBLIC_COMPLIANCE_TRANSITIONS_ENABLED`, `EXPO_PUBLIC_COMPLIANCE_CORRIDORS_ENABLED` (exactly `false` disables). Master-off suppresses fetching, numeric limits and alerts. These are public build-time switches, not authorization or remote flags. Expo/Fastify uses environment flags; Vercel Flags SDK's Next.js/SvelteKit integration is not installed. Server master-off also stops existing builds receiving proof, subject to maximum three-second client validity.

Set `EXPO_PUBLIC_COMPLIANCE_API_URL` to the public HTTPS endpoint in production. The development tunnel allows only the bounded POST `/rova-api/safety/alert-context` in addition to existing search/routing proxies. It forwards no keys or admin routes; restart Metro after configuration changes. Production APKs need this code update and a configured public backend. No new paid alert-provider subscription is introduced; normal hosting/database/map/routing costs still apply.

## Tests and demo isolation

API build/tests exercise the HTTP contract and real PostGIS migration, publication, audit, review invalidation, current target-rule proof, corridor geometry/zone requirements, unsupported camera metadata, source/zone withdrawal, missing data, flags and sanitized outages. Use only the guarded disposable local `rova_test_*` database described in README.

Mobile tests exercise sustained states, cooldown/hysteresis, duplicate fixes/events, noisy/stale GPS, missing speed, context expiry/displacement, geofence entry/exit jitter, flags, demo exclusion, audio opt-out and transport validation. Fixtures explicitly say DEMO/ISOLATED TEST. Simulated reviewed records exist only in automated tests in that disposable database, never in the app's production data. No demo feed is enabled in navigation; synthetic provenance cannot be promoted to verified records.
