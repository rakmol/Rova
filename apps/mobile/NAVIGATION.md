# Turn-by-turn guidance and voice

ROVA Smart Alerts integrate current verified limits, sustained overspeed detection and reviewed upcoming transitions/corridors. See [SMART_ALERTS.md](../api/SMART_ALERTS.md) for policy, flags, evidence requirements and limitations. No real limit/enforcement dataset is loaded automatically.

## Audit and implementation

The earlier screen used Mapbox native progress, automatic rerouting and voice events. It did not have a complete app session state machine, pause/resume, locally tested progress rules or guidance along a selected Geoapify route. The current `/navigation` screen uses the real `RoutingProvider` route selected in route options, foreground location and device speech synthesis. If no provider route is selected, it requests a genuine route to the destination. It does not start the independent Mapbox voice session, so two engines never speak simultaneously. Mapbox remains the navigation screen's map renderer; route options retain the MapLibre preview.

## Session states and lifecycle

`src/navigation/session.ts` contains the pure, testable `NavigationMachine` and `VoiceGate`. States are idle, previewing, navigating, off-route, rerouting, arrived, paused and error. A route with located maneuvers is validated before previewing/start. Samples and routes with missing or unlocated maneuver steps cannot start guidance. The API preserves Geoapify `from_index` values as global `geometryIndex` positions, adjusting connected-leg offsets; unavailable/ambiguous indexes remain absent. Older selected previews must be refreshed and reselected rather than silently replaced with another path.

The navigation screen has no manual Pause/Resume control. Foreground interruptions are handled internally: leaving the app stops the foreground GPS watcher and speech; returning automatically restarts the watcher and waits for fresh, reliable GPS before advancing progress or speaking. This is not background location tracking. GPS gaps retain the route and last known instruction with a small updating-GPS notice, hide the stale turn distance and speed, and label journey estimates as based on the last known position. Accuracy and rerouting thresholds remain unchanged. Errors still provide Retry guidance and End remains available.

The screen shows a large upcoming provider instruction, distance to that maneuver, estimated arrival clock time, remaining journey time and distance. GPS speed is separate from route estimates. Arrival requires three distinct accurate fixes within 25 m of the destination and 40 m of the route end. Pausing stops location watching and speech and cancels reroute requests. Resume requires a new fix. Leaving the foreground pauses guidance and requires explicit Resume. End/unmount removes watchers, timers and AppState listeners, cancels requests and stops speech. No background navigation or persistent trip tracking is started.

## Progress, uncertainty and rerouting

The foreground watch requests updates with a zero movement threshold, so stopping at a junction or testing while stationary does not suppress updates through a three-meter distance filter. If GPS updates stop, the route and last known maneuver remain visible with explicit waiting/last-known labels. This does not end or pause the navigation session; a fresh valid fix restores live guidance automatically. Stale fixes still cannot trigger speech, rerouting or arrival, and stale speed is unavailable.

Startup waits for the app to be active before requesting GPS, routing or starting guidance. Temporary system activities during permission prompts do not cancel preparation; it resumes when the app returns. Once guidance has started, leaving the foreground still pauses the session and requires explicit Resume. End/unmount cancels any startup foreground wait, so a late foreground event cannot restart an ended session.

The initial one-shot OS location request has a 20-second timeout. End/pause cancels the app's wait and ignores late results; the underlying OS one-shot request itself is not cancellable through Expo. A late permission grant after End cannot start location acquisition.

GPS must have a finite accuracy of at most 35 m, be at most ten seconds old and not more than two seconds in the future. Duplicate/out-of-order fixes do not advance progress. Implausible jumps are rejected. A timer suspends guidance when updates stop. Rejected fixes neither advance progress nor confirm deviation/arrival. The screen warns that frozen progress and ETA may be stale.

Matching projects onto provider route segments using local geographic geometry and cumulative geodesic distance. After the initial match, a window (80 m backward; at least 180 m forward, expanded by elapsed time) limits skipping to a later loop or parallel segment. Remaining distance and time are proportional static estimates based on the provider's total distance and duration, not live traffic predictions. This is geometric route matching, not a full road-network or probabilistic map matcher.

Off-route distance must exceed max(45 m, twice reported accuracy). Wrong direction means heading differs from the matched segment by over 110 degrees while speed exceeds 3 m/s; sufficiently separated fixes can provide movement heading if the device heading is unavailable. Three distinct consistent deviation fixes across at least five seconds are required before recalculating. A single GPS outlier does not trigger a reroute. While checking position, ordinary maneuver speech is suspended. Reroutes use the same RoutingProvider, are limited to once per 30 seconds and cannot overlap. No-route/network failures retain an explicit off-route warning instead of substituting a sample. An abort or late response cannot restart a paused/ended session. A successfully returned route waits for fresh GPS before giving instructions.

## Location marker

Map views use a custom native navigation arrow instead of the default dot. A blue arrow rotates using the GPS travel course while moving; a grey arrow with a pause badge indicates stationary readings. A hollow grey arrow indicates unavailable, stale or unreliable motion/heading data. Speed hysteresis (moving at 0.8 m/s, stopped at 0.3 m/s) reduces flicker. The marker reads the map SDK's shared location stream, removes its listener on unmount and does not modify location coordinates, route matching or navigation progress. SVG sources and 1x/2x/3x PNGs are in `assets/images/navigation`. No native dependency or APK rebuild is needed.

## Voice

`expo-speech` supplies on-device text-to-speech. Installing its native module requires an updated development APK once; older APKs remain usable with clearly labelled visual-only guidance. No paid speech subscription is added. Available voices, audio focus, pronunciation and offline voice availability depend on device settings; iOS silent mode can suppress sound. The app reports synthesis errors without stopping visual guidance.

Prompts use real provider text. Each route/maneuver can receive an approach prompt within 300 m and a close prompt within 35 m, with at least eight seconds between announcements. Prompt keys prevent repeats caused by jitter; a close prompt suppresses its earlier approach prompt. Arrival is announced once. Mute cancels queued/current speech without pausing navigation; unmute does not replay already announced prompts. Pause, GPS uncertainty, off-route/rerouting, End and unmount cancel speech. Replacement prompts stop old speech before speaking, and generation guards prevent stale queued prompts from starting later. Mute is held for the current session only.

## Limits and actual-road validation

**Experimental: this implementation has not been verified on actual Accra roads. Do not treat lane guidance or spoken directions as fully dependable.** There is no lane-level guidance. Closely spaced junctions, flyovers, parallel roads, tunnels, noisy headings and GPS drift can confuse geometric matching. Some short maneuvers may not be spoken because of the anti-spam interval. There is no guarantee of traffic, closures, accessibility, road restrictions or toll completeness. Route language is English; Ghana street/landmark pronunciation depends on the device voice. Follow signs and road conditions and operate controls only when safe.

Before release, test with a passenger recording results on real Accra routes: normal turns and roundabouts, closely spaced junctions, flyovers/parallel roads, stationary and inaccurate GPS, a missed turn, wrong direction, network loss/recovery, pause/resume/background, arrival and mute/unmute. Confirm audio with phone speakers and Bluetooth, and confirm no duplicate announcements or stale reroutes. A successful cloud build and unit tests do not establish road safety or navigation reliability.

## Verification

Run API tests/build and mobile tests/lint/typecheck from the repo root. `navigation-session.test.ts` covers projected progress, maneuver distance, GPS quality/jumps/staleness, confirmation/cooldown, wrong direction, pause/resume, arrival, voice deduplication and loop proximity. `navigation-hook.test.tsx` covers mute without pause, watcher cleanup/restart and cancelling an in-flight reroute with a late result. API contract tests cover preserving actual maneuver geometry offsets without inventing missing anchors. All route fixtures and mock providers are confined to automated tests.
