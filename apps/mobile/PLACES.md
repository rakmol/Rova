# Destination search and places

Open **Map → Search destinations & recent searches**. Search suggestions show only real provider responses. Select one to see its supplied name, address, coordinates and map pin, then choose **Use this destination** to return to route preview. GPS remains opt-in through **Locate me**; search uses an Accra bias rather than silently requesting GPS.

## Street and landmark search: Geoapify

Geoapify is now the active search provider on this development setup. Mapbox continues to supply maps and navigation only. Geoapify autocomplete returns both street/address and named amenity records without restricting the request to either type. A live test on 7 November 2026 returned Accra Mall and Makola Market as amenities and Oxford Street as a street. Coverage still varies; no synthetic landmarks or demo locations are inserted.

The shared `PlacesProvider` interface is unchanged. The Geoapify adapter validates Ghana country codes, stable place IDs, finite coordinates, and actual provider names; it retains attribution and removes duplicate IDs. The inline map search and dedicated destination screen use the same configured provider. Exactly one search provider is active at a time; the older Mapbox adapter is an address-only setup fallback, not an additional search source.

### Local configuration

```text
# apps/api/.env — server only, ignored by version control
PLACES_PROVIDER=geoapify
GEOAPIFY_API_KEY=YOUR_KEY
PLACES_DAILY_REQUEST_BUDGET=1000

# apps/mobile/.env — no secret key
EXPO_PUBLIC_PLACES_PROVIDER=geoapify
# Production requires the full public HTTPS endpoint of your deployed API:
EXPO_PUBLIC_PLACES_PROXY_URL=https://YOUR-API/v1/places/search
```

For local development on the connected phone, `metro.config.js` exposes only `/rova-api/places/search` through the existing Expo HTTPS tunnel and forwards it to `127.0.0.1:4000/v1/places/search`. The app automatically derives that URL from an `.on.expo.app` host in development mode if no explicit proxy URL is set. Start the API with `npm run dev:api` and Metro with `npm run dev:mobile -- --tunnel` (or `npx expo start --dev-client --tunnel` from `apps/mobile`). Both processes must stay running. Restart Metro after adding its configuration or changing the provider environment. This bridge does not expose admin APIs and contains no credentials. Production still needs a deployed HTTPS backend and explicit URL; the development bridge is not a production deployment.

### Geoapify costs, limits, attribution and caching

Checked 7 November 2026: the Free plan offers 3,000 credits/day, no credit card required and up to 5 requests/second. An autocomplete request costs one credit. The first optional monthly paid tier is $59 for 10,000 credits/day. No paid plan was purchased. Quotas are shared with other account usage; provider terms allow suspension or possible overage charges outside plan limits, so do not treat the local limiter as an account-wide billing guarantee.

The client keeps the 400 ms debounce, cancellation, 8-second timeout, 6-result maximum and 30-request/minute rate limit. The backend enforces its own 30 requests/minute per IP and defaults to 1,000 uncached upstream requests per UTC day, per process. Licensed Geoapify results can be cached: both client and server cap their memory caches at 40 queries for 5 minutes. Cache hits do not consume the server's upstream-request budget; all incoming calls still count toward its per-IP limit. The client requires the backend's `x-rova-places-storage: geoapify` confirmation before accepting results or caching them.

The UI displays provider/data-source attribution and links to Geoapify, OpenStreetMap copyright, and current pricing. Returned data-source attribution is preserved with each result. Search text and the Accra bias are sent through your API to Geoapify; queries/coordinates can live in the short-lived result cache but are not logged by the proxy. Optional recent history still stores only the user's typed queries, defaults off, and is clearable. Maps and navigation have separate Mapbox usage terms.

References: [autocomplete schema and street/amenity types](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/), [country restriction](https://apidocs.geoapify.com/how-to/addresses/restrict-address-search-country/), [storage and attribution](https://www.geoapify.com/geocoding-api/), [pricing](https://www.geoapify.com/pricing/), [terms](https://www.geoapify.com/terms-and-conditions/).

## Address-only setup fallback: Mapbox Geocoding v6

The `PlacesProvider` interface and Mapbox implementation live in `src/places/provider.ts`. They are independent of native maps and accept an injected fetch implementation for contract tests. Both the dedicated screen and existing inline search use this implementation; the previous Search Box integration has been removed.

Mapbox's documented Search Box geography excludes Ghana. Geocoding v6 supports addresses, streets and administrative places, but does **not** include POIs. Searches for markets, landmarks, businesses and junctions may return nothing; use a nearby street or suburb. The UI neither synthesizes landmarks nor substitutes demo data. It provides only details actually returned (no invented phone numbers, opening hours or ratings). Results are filtered to Ghana with an Accra proximity bias; the adapter also validates returned country, IDs and coordinates and removes duplicates. A successful live `Accra` query was verified during implementation; this is not a guarantee of every location's coverage.

## Credentials and optional proxy

Direct development mode reuses `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, which must be a public `pk.` token. An `sk.` token must never be placed in the mobile environment or binary. Restrict public token permissions in the Mapbox account.

For server-held credentials set:

```text
# Mobile: full HTTPS endpoint URL; contains no credentials
EXPO_PUBLIC_PLACES_PROXY_URL=https://YOUR-API/v1/places/search

# Backend only (apps/api environment): do not prefix these with EXPO_PUBLIC_
MAPBOX_PLACES_ACCESS_TOKEN=YOUR_SERVER_TOKEN
PLACES_DAILY_REQUEST_BUDGET=1000
MAPBOX_PLACES_PERMANENT_STORAGE=false
```

The proxy is registered by the existing Fastify API, accepts only a query and proximity, constructs a fixed Mapbox URL, forces Ghana, bounds input, omits tokens from responses, suppresses request-query logs, and uses an 8-second timeout. Upstream error bodies are not passed through. Without its server token the endpoint returns 503. The proxy has not been provisioned on a public host: configure the URL above after deploying your API behind HTTPS. Direct mode works without that step because its token is explicitly public.

## Usage, caching and privacy

- Autocomplete waits 400 ms after typing; requests older than the current query are cancelled/ignored. Requests time out after 8 seconds. At most 6 validated results are displayed.
- The device permits 30 searches/minute. The optional server separately enforces 30 requests/minute per IP, a default budget of 1,000 requests per UTC day, and at most 5,000 active IP counters. These are per-process safeguards, not billing guarantees; use a shared limiter/WAF and Mapbox account alerts before scaling to multiple instances. Do not trust arbitrary forwarded IP headers.
- Mapbox forbids caching **temporary** geocoding results. Temporary mode is the default: no provider results, IDs, coordinates or addresses are written to history or a result cache.
- Licensed **permanent** mode is explicit opt-in: `EXPO_PUBLIC_PLACES_PERMANENT_STORAGE=true`. It sets `permanent=true` on direct requests and enables a bounded 40-query, five-minute memory cache. It requires a credit card or enterprise contract and may incur different charges. For proxy mode also enable `MAPBOX_PLACES_PERMANENT_STORAGE=true`; the server must confirm permanent storage in its response header or the client will not cache results.
- Recent searches are off by default, local only, and limited to 10 **user-typed queries**, not provider-derived place records. Users can clear them or turn storage off (which erases queries). Writes are serialized so an earlier save cannot overwrite a later clear/opt-out. File storage failures are shown. Temporary selected place data is kept only as needed for the current preview/navigation flow.
- Search text and the Accra proximity bias are sent to Mapbox (and your API if configured). No search analytics were added. `© Mapbox` attribution is visible in the UI and the native map retains its own attribution.

## Costs and coverage references

Checked 7 November 2026: published temporary-geocoding pricing includes 100,000 monthly requests free, then $0.75/1,000 in the next tier. Autocomplete can generate multiple billable requests while typing. Existing account usage and contracts affect the actual charge. Permanent geocoding, maps and navigation have separate terms/pricing. The app links to the current price sheet; recheck before enabling paid usage.

- https://docs.mapbox.com/api/search/geocoding/ — response schema, POI exclusion, temporary/permanent storage, autocomplete billing.
- https://docs.mapbox.com/api/search/search-box/ — supported geographies.
- https://www.mapbox.com/pricing — current prices and account-specific eligibility.

Run `npm test --workspace @rova/mobile` and `npm test --workspace @rova/api` for contract, UI, history, cache licensing, validation, error and proxy-limit tests. Run mobile lint/typecheck and API typecheck as well. Actual keyboard layout and map pin placement still need confirmation on the connected physical phone.
