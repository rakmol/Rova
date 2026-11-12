# Offline and low-data support

Implemented against Expo SDK 58. This is **limited saved-route guidance**, not a full offline navigation/routing engine. Real-road and physical Android airplane-mode validation remain required before release.

## Driver flow

- Open **Compare routes**, choose an actual Geoapify route, then **Save route for offline guidance**. Saving is explicit; one route is retained, not continuous travel history. Geometry, located maneuvers, static distance/time and attribution are saved for 24 hours.
- **Settings → Offline & low data → Resume saved route** restores that route. GPS permission and a fresh fix near its path are required offline. Text/voice guidance and distance progression use the existing GPS state machine. Missing/poor GPS, wrong direction and ambiguous progress retain the existing suppression rules. No new route or offline reroute is calculated. Off-route guidance requests reconnection rather than inventing a path.
- **Low-data mode** changes safety lookup cadence from at most every 2 seconds to every 15 seconds and pauses automatic community hazard delivery. GPS still updates at the existing navigation frequency. Without a valid offline safety pack, verified warnings can be intermittent between online proofs: cached numeric limits are never stretched beyond their validity.
- Connection notices distinguish offline, unconfirmed connection and unavailable online services. Failed safety requests use bounded 2–30 second exponential backoff. Restoring connectivity permits the next bounded retry; no backlog of GPS positions is queued or uploaded.
- **Download approved nearby safety data** explicitly requests location and a rounded approximately 2 km square for the selected vehicle. Missing approved/licensed data is reported honestly. No demo source, default speed or camera report is substituted.
- **Delete offline route and safety downloads** destroys the encryption key and removes encrypted slots. Normal privacy erase also clears offline downloads. SDK-managed map tiles are separate and are not described as encrypted ROVA files.

## Providers and permission checks (2026-11-10)

[Geoapify Routing API](https://www.geoapify.com/routing-api/) explicitly permits storing/redistributing routing results derived from open data. Saved routes retain Geoapify/OpenStreetMap attribution; underlying [provider terms](https://www.geoapify.com/terms-and-conditions/) and data licenses apply. Normal provider request credits apply when fetching/updating a route; reading a local saved route makes no routing request. No traffic-aware ETA is claimed.

[Mapbox cache management](https://docs.mapbox.com/android/maps/guides/cache-management/) documents native SDK disk caching. ROVA uses that native cache for recently viewed tiles, requesting a 32 MiB cap through the installed RNMapbox adapter (native enforcement must be checked on the target APK). SDK response expiry/revalidation remains intact. There is no tile scraping, MBTiles export, region prefetch or bypass of provider tile limits. Map style/glyph/zoom coverage may be absent in airplane mode, so a complete offline basemap is **not guaranteed**. The MapLibre/OpenFreeMap preview is not offered as a downloaded map pack; no bulk download permission is assumed. SDK/service pricing still applies to online resource requests.

## Approved safety export

API: `GET /safety/offline-pack?lon=&lat=&vehicleType=`. Disabled by default. Before enabling, the operator must verify source redistribution/offline rights and set private API configuration:

```dotenv
OFFLINE_SAFETY_ENABLED=true
OFFLINE_SAFETY_SOURCE_IDS=comma-separated-real-approved-source-uuids
```

This is an explicit operator license/approval allowlist, not an automatic interpretation of license text. It does not grant database approval. Both the road's source and every contributing rule source must be allowlisted, independently reviewed and currently eligible for online serving. No real source is enabled by this implementation. Existing production data is not republished or auto-approved.

The query exports all non-synthetic physical road candidates intersecting a small area, including unapproved roads as **blockers without numeric rules**. A road with any non-published, incomplete or disallowed rule is withheld from numeric offline serving. Missing candidates, more than 64 roads, over 40,000 vertices or a payload over 2 MiB fails the entire download; it is never silently truncated. Only geometry and legal evidence are exported, not reporter/user identities, account tokens, precise mobile cameras or enforcement alerts.

Schema version 1, SHA-256 content version and six-hour expiry are checked before installation. Every fix uses the **same verified-rule evaluator as the online API**, recalculating geometry distance/heading/progress locally. A 110 m guard band prevents serving near package boundaries where an unexported competing road could exist. Parallel roads, ramps, junctions, ambiguous geometry, vehicle mismatch, GPS age/accuracy, rule/source dates, missing review evidence and uncertainty return unknown. Partial or malformed downloads do not replace the installed version.

Expiry or clock rollback before package creation displays **data may be outdated** and suppresses offline numeric limits/voice warnings. An offline pack cannot receive revocations immediately; the maximum package lifetime is six hours, and road signs always take priority. Do not claim real-time legal updates while disconnected. There are currently no automatically supplied verified Ghana packs; source verification/licensing is still an operational task.

## Local storage and build requirements

Encrypted route/pack/preferences use Expo Crypto AES-256-GCM with a fresh generated nonce per write and a key held in Expo SecureStore (device-only, when unlocked on iOS). A two-slot commit verifies the written ciphertext/decrypted JSON before switching its SecureStore pointer. An interrupted write preserves the last committed version. At most one route and one safety pack are active. The older commit slot is cleaned after success; corruption or key loss fails closed. Key deletion makes retained ciphertext unreadable.

New native dependencies are `expo-network`, `expo-crypto` and `expo-secure-store` (SDK-compatible installation; SecureStore config plugin included). **An updated Android development/release build is required** for encrypted downloads and OS network observation. Older APKs guard missing modules: existing navigation still runs, downloads show the rebuild requirement, and low-data mode can apply for the current session. This is not enabled by JavaScript hot reload alone. Web secure persistence is not promised. A development APK still uses the Expo development server to load application JavaScript: open it while connected before testing loss of data during guidance. Cold-starting completely offline requires a standalone APK with an embedded bundle and remains outside the development-launcher guarantee.

See [Expo Network](https://docs.expo.dev/versions/v58.0.0/sdk/network/), [Crypto](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/) and [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/) for platform behavior. Uninstall/key loss can erase downloads; they are not an account backup. The SDK tile cache is provider-managed public map content, not part of the encrypted store.

Production builds set `EXPO_PUBLIC_OFFLINE_SAFETY_API_URL` to the full HTTPS endpoint. Development uses the existing Expo tunnel proxy. No API credential goes into mobile configuration. Source dataset downloads are manual and bounded; large tile regions are not downloaded automatically on Ghana mobile data.

## Automated and physical checks

Automated tests cover simulated airplane mode, continuing selected-route GPS guidance without HTTP calls, no offline reroute, current/expired/mismatched packs, parallel unreviewed roads, poor/wrong-heading GPS, stale rules, schema mismatch, partial writes and failed commits. Real PostGIS tests verify published export and exclusion immediately after a rule is edited. Existing navigation, voice, privacy and provider contracts are regression-tested.

Before release, use a fresh native APK on a physical Android phone:

1. Fetch a real route on Wi-Fi, save it, restart the app and inspect the saved route/attribution.
2. Enable airplane mode while keeping GPS/location on. Resume near the path; verify distance/voice and explicit offline state. Visit uncached map zooms and verify readable text guidance when tiles are missing.
3. Move off the saved route safely as a passenger: no replacement route/false instructions should appear; reconnect to reroute.
4. Interrupt a safety download by disabling data or terminating the app before commit; the prior complete pack must remain selected.
5. Use an isolated expired/test pack to check outdated labels and suppression. Do not publish synthetic limits to test a real road.
6. Reconnect on intermittent mobile data; inspect retry cadence, request/byte counts, GPS accuracy and battery use. Physical tests and native keystore behavior are not claimed to have been verified by Jest.
