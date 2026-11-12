# Route options, distance and ETA

Select a destination on Map, calculate a route, then choose **Compare route options**. Select an available route to view its MapLibre polyline, distance, estimated duration and provider-supplied maneuver instructions. **Use route preview** carries that geometry back to Map.

Guidance now follows the selected RoutingProvider geometry using foreground GPS and device text-to-speech. See [NAVIGATION.md](./NAVIGATION.md) for session states, matching, rerouting, voice, tests and limitations. No road restrictions, live conditions or ROVA speed limits are verified by this feature.

## Provider contract and endpoint

`RoutingProvider` and the response types live in `packages/shared/src/index.ts`. The API adapter uses the documented [Geoapify Routing API](https://apidocs.geoapify.com/docs/routing/) with `drive`, metric units and instruction details. It requests balanced, short and fewer-maneuver preferences and deduplicates identical geometries. These are supported routing preferences, not a guarantee of three alternative paths.

`GET /routes?origin=-0.187,5.6037&destination=-0.1731,5.6222`

Both inputs are **longitude,latitude**. The server converts to Geoapify's latitude,longitude waypoint order. Successful responses contain `provider`, `routes`, `warnings`, `fetchedAt`. Each route contains `id`, `label`, GeoJSON LineString `geometry`, `distanceMeters`, `durationSeconds`, `maneuvers`, `tolls`, `attribution`, `isSample`, `trafficAware`, `etaKind`. Maneuvers include supplied text and nullable distance/time. Disconnected or invalid geometry is rejected rather than inventing a connecting line.

Every current route has `trafficAware: false`, `etaKind: "static_estimate"`. Live Ghana traffic coverage is not verified. The Mapbox traffic feature flag is also ignored until coverage has been verified. Unknown toll metadata is `unknown`; `none_reported` is only used when the provider explicitly supplies false and does not promise a toll-free trip.

No route returns an empty routes array, without invented alternatives. Network errors, timeouts and unavailable credentials produce explicit errors and Retry. If a later preference fails, genuine earlier routes remain with a warning. Map tile errors leave distance and instructions available. There is no promised offline routing.

## Configuration and limits

- Keep `GEOAPIFY_API_KEY` only in `apps/api/.env`; the API dev/start scripts load that file. It is never sent to the phone. Restart the backend after changing configuration.
- Set `EXPO_PUBLIC_ROUTES_API_URL` to the full HTTPS `/routes` URL for deployed or LAN setups. It contains no credential. On the Expo development tunnel, a narrow GET-only Metro bridge provides `/rova-api/routes`; all other backend routes remain inaccessible through that bridge.
- Upstream requests time out after eight seconds each; comparison/client timeouts allow the three sequential preferences. A bounded 40-entry memory cache expires after two minutes. Responses are marked no-store for downstream HTTP caches.
- The API allows ten comparisons per minute per IP. `ROUTING_DAILY_REQUEST_BUDGET=300` reserves three upstream requests per uncached comparison per UTC day, including partial failures. Cache hits do not consume that budget. This is an in-process request guard, not a provider credit or billing guarantee; restarts reset it and multiple server instances need a shared limiter. Destination search shares the Geoapify account's quota.
- Coordinate queries are excluded from API route request logging. The provider still receives coordinates to calculate routes. Do not persist them in analytics or error logs without a separate user-facing policy.

## Licensing, attribution and cost

[Geoapify pricing and free-plan terms](https://www.geoapify.com/pricing/) permit commercial apps within the plan quota and attribution requirements. At verification on 2026-11-07, the free plan listed 3,000 credits/day and up to five requests/second, with no credit card required. A normal two-waypoint routing request generally costs one credit, so a comparison can use three; long routes can cost additional credits. Check the linked pricing and the account dashboard for current limits. No paid subscription is enabled by this integration. This app's limiter is not a billing control for other uses of the key.

The screen displays linked Geoapify and OpenStreetMap attribution. MapLibre uses the [OpenFreeMap Liberty style](https://openfreemap.org/quick_start/) with map attribution enabled, plus OpenFreeMap/OpenMapTiles/OpenStreetMap credits. There are no bulk offline tile downloads. Mapbox maps and native navigation continue under their separate license and pricing.

MapLibre is a native dependency. Install the updated EAS development APK once; Expo Go cannot load it. Older ROVA development APKs show a clearly labelled Mapbox fallback preview of the same geometry until updated. Ordinary JavaScript changes refresh through the connected Metro server.

`scripts/namespace-maplibre-codegen.cjs` runs at install and namespaces MapLibre 11.5.1's generated map-view spec to avoid a duplicate C++ symbol with Mapbox. Its runtime module name stays unchanged. The dependency is pinned and the script fails on an unexpected version so upgrades require reviewing this compatibility fix.

## Verification and fixtures

Run `npm test --workspace @rova/api`, `npm run build --workspace @rova/api`, `npm test --workspace @rova/mobile`, `npm run lint --workspace @rova/mobile`, and `npm run typecheck --workspace @rova/mobile` from the repository root.

API contract tests verify documented parameters, coordinate order, deduplication, geometry validation, toll states, empty routes, partial failure, credential sanitization, caching and budgets. Mobile tests cover HTTP contract validation, connectivity/cancellation, alternative selection, empty states and visible sample-route warnings. Mock providers and geometry fixtures exist only in automated tests. `isSample` results display **SAMPLE ROUTE**, and cannot be used for navigation. Production has no mock fallback. Native MapLibre rendering and real driving guidance still require physical-device verification.
