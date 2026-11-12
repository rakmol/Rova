# Nearby hazard updates and traffic labels

## Implemented delivery

`GET /v1/incidents/stream?lon=&lat=` requires an anonymous reporting bearer in the
Authorization header. It delivers SSE `event: snapshot` with a complete `HazardSnapshot`
or `event: unavailable` with retry guidance. Tokens never go in query strings. Snapshots
contain only **moderator-reviewed community** incidents, never pending/rejected/expired
or synthetic incidents. Reviewed community evidence is not authority verification.
The existing manual nearby endpoint still includes explicitly unverified pending reports.

Coordinates select a 0.02-degree region (~2.2km in Ghana); there is one database query
per active region every5seconds, shared across its subscribers. Query radius4000m;
maximum50 records (nearest region center), `truncated=true` if more. The app filters to
2km of its position and retains the selected region until moving1800m from its center,
reducing GPS boundary churn. Navigation updates region from its existing reliable GPS
progress: it starts no additional GPS watcher. Reports tab subscribes to the area last
explicitly checked, not an automatically tracked travel history. Region subscriptions
are ephemeral, not persisted/logged; foreground exit aborts streams and requests.

Snapshot checkedAt is stamped **before** the DB query, preventing a delayed older
transaction view from replacing a newer snapshot. Every client update fully replaces
the prior collection; withdrawn and disputed records disappear on the next snapshot.
Records are independently removed at expiry on server/client, including delayed frames.
The app labels data stale after30seconds without a sufficiently recent checkedAt and
shows the actual check time. Server clock/phone clock need normal synchronization;
frames older than60seconds or more than30seconds in the future are rejected. Stale
nonexpired records may remain visible with the stale label; this does not prove a hazard
still exists. Empty feeds never claim that a road is clear.

Uses SDK58's documented [`expo/fetch` streaming API](https://docs.expo.dev/versions/v58.0.0/sdk/expo/),
not the nonstreaming React Native fetch implementation. No new native package.
Streams have a20-second no-frame watchdog. HTTP fallback has a12-second timeout.
Subscriptions stop on app background/unmount and reopen for the selected region on
foreground. GPS-unreliable navigation stops its subscription until reliable progress
returns. Reports displayed for a manually selected area continue to describe that area.

## Recovery, queues and capacity

PostgreSQL is the durable source of truth. Each API instance polls the shared DB, so
changes made on another instance are picked up without an in-memory-only event bus.
No delivery queue is required for snapshots: reconnect replaces state from current DB
contents. Event IDs/replay are intentionally unnecessary. There is no offline report
or vote retry queue; ambiguous mutations remain explicit user actions with existing
duplicate handling, preserving the prior safe reporting flow.

Reconnect starts at~1second with20% jitter, doubles up to30seconds, resets after a
valid streamed snapshot. During outages the app attempts a fresh HTTP snapshot at most
once per30seconds, without overlapping fallback requests. Older checkedAt cannot roll
back newer data. Frames are bounded to128KiB and snapshots to50 records.

Each API process caps streams at100 total and2 per anonymous device. Each stream
rotates after45seconds, causing reauthentication (revocations/expiry take effect at the
next connection, at most45seconds). There is a20/minute stream opening IP rate limit,
12/minute HTTP snapshot limit and the existing global IP limit. Many users behind the
development tunnel share one IP; periodic refresh remains available when stream
capacity is exhausted. Production must configure trusted proxy handling explicitly.

Backpressure uses **coalesce-latest**: while a socket is blocked, intermediate snapshots
are dropped; the next scheduled poll supplies current state after drain. A socket blocked
for more than15seconds is closed. There is at most one pending Node response buffer per
connection; no unbounded per-client event queue. Maximum nominal region polling is
20queries/sec at100distinct regions; SQL statement timeout remains5seconds. These are
design bounds, not a measured production throughput guarantee. Slow networks/proxies
can increase observed update latency beyond the nominal0..5seconds + query/network time.

Run this API on infrastructure supporting long-lived streaming HTTP. Disable reverse
proxy buffering/compression for SSE and allow connection durations above45seconds.
The development Expo proxy forwards only public incident routes and streams SSE; it
never forwards moderator routes. Restart Metro after changing its middleware.

## Metrics and verification

`GET /v1/admin/incidents/realtime-metrics` requires the private moderator bearer.
It exposes process-local connection totals, active connections/regions, frames/bytes,
database reads/errors, dropped backpressure frames and rejected connections, plus
p50/p95 DB-query latency over the last128 reads. Counters reset on restart. No location,
reporter, token, note or region identifier is a metric label. Aggregate across instances
in deployment monitoring. Client HazardFeed also records reconnect, refresh, snapshot,
error and ignored-older-frame counters in memory (no location telemetry).

Tests cover real PostGIS reviewed-only queries, distant regions, SSE withdrawal,
expiry, fragmented frames, stale labels, fallback, reconnect/backoff, older snapshots,
unsubscribe/abort and preventing community records from claiming authority verification.
Run API tests with an explicitly disposable local TEST_DATABASE_URL for DB/SSE checks.
No synthetic incidents are inserted into the app database by verification.

An empty-dataset local baseline is saved in [realtime-local-metrics.json](./data/realtime-local-metrics.json):
first frame6ms locally and962ms through the phone tunnel; subsequent snapshots about5s
apart. Six DB queries had p50~3.3ms and p95~70.3ms, with no DB errors. Both subscriptions
were released after disconnect. This is a connectivity/latency smoke check, not a load
test; the small sample and empty dataset do not establish production performance.

## Traffic provider decision (checked 2026-11-09)

ROVA uses reviewed community congestion reports for visual and spoken navigation
advisories. A report must project100..800m ahead on a bounded section of the selected
route, within150m of it, have fresh feed data (<=30seconds), be unexpired and observed
within30minutes. Two distinct reliable GPS fixes are required. Voice says "Possible
congestion reported ahead near your route. Drive carefully." Rounded report positions
cannot reliably distinguish closely parallel roads or travel direction; the wording
therefore describes a possible issue near the route rather than a confirmed traffic jam
on the carriageway. No road speed, delay, automatic detour or traffic-aware ETA is
inferred. Turn instructions and compliance prompts have priority. The existing mute
and alert-audio controls apply, with one prompt per report/session, nearby duplicate
suppression and a two-minute congestion cooldown. Expired, withdrawn, stale, behind,
distant or ambiguous route matches do not prompt. Reports still require moderator review.

The existing Mapbox traffic toggle is gated off in code. No new traffic layer or paid
provider has been activated. Geoapify route ETAs remain static estimates. Congestion is
a user's reported incident category, never an inferred/measured road speed. No congestion
estimate is calculated from small samples, confirmations, GPS speed or incident density.

Reviewed official sources:

* [Mapbox Traffic v1](https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/)
  and [coverage overview](https://docs.mapbox.com/help/dive-deeper/mapbox-data/): did not
  establish an explicit Ghana live-traffic coverage commitment for this integration.
* [Mapbox Traffic Data](https://docs.mapbox.com/data/traffic/guides/) distinguishes
  typical speeds from observations in the last15minutes and requires a Traffic Data
  license for raw data access. That license is separate from simply having a map token.
* [Published pricing](https://www.mapbox.com/pricing), Traffic Data section: contact
  sales for its license; no applicable Ghana raw-data price was established. This does
  not assert all traffic tiles or routing products share that license/pricing model.

Until Ghana coverage, lawful display/use rights and the applicable product price are
documented and accepted, show **community hazards / no live traffic measurements**.
Adding a provider later requires a separate coverage/licensing/pricing review; an
environment flag alone must never advertise measured traffic or traffic-aware ETAs.
