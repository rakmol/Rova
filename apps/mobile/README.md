# ROVA mobile app

Guidance now follows the selected RoutingProvider route, with an explicit session state machine, GPS matching, pause/resume, guarded rerouting and device speech synthesis. See [NAVIGATION.md](./NAVIGATION.md). This replaces the earlier native-only guidance screen described below; the native Mapbox route adapter remains for map previews. Accra road validation is still pending.

Route comparison now uses Geoapify through `GET /routes`, with MapLibre previews, selectable supported alternatives, distance and static ETA estimates. See [ROUTING.md](./ROUTING.md) for configuration, limitations, attribution, costs and tests.

The Android-first Expo app has Map, Reports, Saved, and Settings tabs. The Map tab uses Mapbox for the map and route previews, and configurable Geoapify search for Ghana streets and landmarks. Open **Search destinations & recent searches** for the dedicated search screen, opt-in local query history, place details and a destination pin. See [PLACES.md](./PLACES.md) for provider coverage, licensing, caching, proxy configuration, rate limits, costs and contract tests. Permission-gated foreground location is optional. Guidance uses RoutingProvider geometry, foreground GPS and device speech; it remains experimental pending physical-device and actual-road validation.

The app's teal/navy theme and System/Light/Dark modes remain in place. The ROVA speed-limit badge stays **unknown** unless an approved ROVA record is available. Mapbox speed-limit and traffic data are not treated as verified ROVA safety data.

During active navigation, ROVA requests foreground GPS updates and displays GPS-derived speed in km/h separately from route estimates. Missing speed may be estimated from sufficiently separated fresh GPS fixes; invalid or stale fixes suspend guidance and display an unavailable speed. Readings stay in memory only. Pause, arrival, End and unmount remove the GPS watcher. No background tracking or precise trip-history storage is started.

## Configure Mapbox

1. Create a Mapbox account and a **public** token beginning with `pk.`. The public token is embedded in the installed app and can be extracted, so it is not a secret. Do not use an `sk.…` token.
2. From the repository root, copy the example and add your token:

   ```powershell
   Copy-Item apps\mobile\.env.example apps\mobile\.env
   ```

   Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.…` in `apps\mobile\.env`. Keep the `.env` file private and out of source control. The SDKs do not need a secret downloads token.
3. Keep `EXPO_PUBLIC_MAPBOX_TRAFFIC_ENABLED=false`. The app ignores this toggle while Ghana live traffic coverage is unverified and uses the standard driving profile with estimated times.
4. Review Mapbox's current [pricing and terms](https://www.mapbox.com/pricing). Maps, Geocoding, and Navigation may have separate usage charges. Set usage alerts/limits where available.

In Geoapify mode, search sends the destination query through ROVA's backend to Geoapify; the separate Mapbox service handles maps and routes. The dedicated search screen uses an Accra bias without requesting GPS. Licensed Geoapify results have a bounded five-minute memory cache; optional local recent history stores only user-typed queries. Location permission is requested only when the user chooses **Locate me**.

## Build and run on an Android phone

The inspected PC does not have a configured Android SDK/JDK, so use an EAS development build:

```powershell
npm install
npm install --global eas-cli
eas login
cd apps\mobile
eas build:configure
eas build --platform android --profile development
```

For EAS builds, add `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to the EAS project's development environment before building. It is a public client token, not a secret. Install the APK using the EAS link or QR code.

In a separate terminal, from the repository root, start Metro:

```powershell
npm run dev:mobile
```

Open the installed ROVA development app. Keep the phone and computer on the same Wi-Fi network; allow Node/Expo through the Windows firewall if prompted. Without a token, the app still opens but clearly indicates that map tiles and search are unavailable.

For local USB builds, install Android Studio and its Android SDK, install a compatible JDK, and enable USB debugging:

```powershell
cd apps\mobile
npx expo run:android
```

`@rnmapbox/maps` and `@rnmapbox/navigation` include native code: Expo Go cannot run them. Rebuild the development client after changing native dependencies or configuration.

## Compatibility and status

- Expo SDK 58 / React Native 0.88.1.
- `@rnmapbox/maps` 10.3.17 with native Mapbox Maps SDK 11.33.0.
- `@rnmapbox/navigation` 0.1.2 wraps Mapbox Navigation SDK 3.33.0 and requires the New Architecture, Android min SDK 24, and compile SDK 36. It is a community-maintained pre-1.0 wrapper; APIs can change.
- Navigation runs with simulated locations disabled, uses voice guidance, and enables rerouting. The app does not display Mapbox speed-limit annotations as ROVA safety data.
- Ghana traffic coverage has not been verified; traffic routing is off by default. Search relevance and route quality in Accra need real-device checks.
- A custom EAS/native build and Android device test are required before considering turn-by-turn behavior verified.

## Checks

From the repository root:

```powershell
npm run typecheck
npm run lint --workspace @rova/mobile
npm run test --workspace @rova/mobile
```

Expo-specific dependency checks:

```powershell
cd apps\mobile
npx expo install --check
npx expo-doctor
```

See the root [README](../../README.md) for backend, PostGIS, admin import, and safety-data requirements.
