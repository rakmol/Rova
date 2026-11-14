# Map interface and community contributions

The Explore screen uses a full-screen map, floating search and an expandable journey sheet. Home/Work shortcuts use the driver's existing local saved places. Destination search, route choices, Saved and Settings use the same theme and controls. Navigation has a compact instruction panel, a map with panel-aware camera/attribution placement, journey metrics and fixed Mute/End buttons. Large text, short screens and landscape use a scrollable layout instead of overlapping guidance. The travelled route remains grey and the road ahead stays highlighted.

Google Maps' official [getting started](https://support.google.com/maps/answer/144349) and [Contribute](https://support.google.com/maps/answer/9678350) documentation informed the organisation. ROVA keeps its own identity, map providers and safety labels; it does not use Google's branding, assets or map data.

Android Back closes an active destination search and restores the journey panel, or closes a Settings category/contribution form. At a top-level tab it returns directly to Explore instead of walking tab visit history. The home search also has an explicit Back arrow. Dragging the journey handle expands/collapses the panel; scrolling this panel never hides the bottom menu. Other full-page lists retain their scroll-to-hide menu behaviour. The unavailable-speed card has been removed from Explore; navigation still honestly indicates unknown limits.

## Contribution flow

Guests can submit a place or observed fixed enforcement equipment without signing in. Existing anonymous reporting credentials are encrypted on the phone and used for ownership. Road hazards continue through the existing incident submission and moderation system.

1. Confirm parked/passenger interaction. The existing driving gate blocks forms during driving unless passenger mode is selected.
2. Enter a bounded name/category, deliberately select a Ghana map pin (or request one current GPS reading), and optionally describe the observation and travel direction. No route history is collected. Mobile enforcement positions and supplied verification flags are rejected.
3. `POST /v1/incidents/contributions` stores a **pending suggestion**. The service limits submissions to 5/device/hour and 20/IP/hour, with a bounded HTTP body and persistent quotas. Concurrent own duplicates within 50 m are deduplicated without revealing other reporters' records.
4. Submission stays on a confirmation view, with explicit Report another / View my contributions actions. Reporting again retains the chosen interaction mode within the active session. Road-problem reporting is inline in Contribute, not a hidden-tab redirect, and stays there after submission. A real background transition resets interaction mode when no request is underway; a temporary permission dialog does not.
5. `GET /v1/incidents/contributions/mine` returns up to 30 active suggestions belonging to the reporting installation.
6. Reviewers/administrators use **Community contributions** in the admin dashboard and choose **Approve on map**, or reject/withdraw. A comment and current revision are required; conflicts/expired records are rejected. Decisions create an immutable audit entry including display approval time. Previously reviewed suggestions stay unpublished until explicitly approved.
7. Road-problem reports appear under **Hazards** and use the existing community-hazard moderation/publication workflow. Approved community hazards and approved suggestions are returned by `GET /v1/incidents/contributions/nearby?lon=&lat=` (4 km, at most 100, rate limited, no reporter identifiers/private notes). Map labels explicitly say Community; fixed equipment also says unverified. Pending, expired, rejected, withdrawn and synthetic records are excluded.

**Display approval is not authority verification.** Map pins do not insert places into licensed provider search results, add enforcement voice warnings or establish a legal speed limit. Operators must use the existing sourced, independent approval workflow to publish eligible safety records. There is no fabricated confirmation, speed, coverage or contribution score.

## Database and privacy

Apply migrations `016_community_contributions.sql` and `017_approved_community_map_pins.sql` through the checksum migration runner. The separate table uses WGS84 point geometry and a spatial index, strict Ghana bounds, row security and revoked browser/Supabase role grants. The API database identity owns access; driver auth never grants admin access. Migration 017 does not approve any existing records.

Suggestions expire after 90 days, are excluded from reads/reviews after expiry and are deleted by hosted/CLI maintenance. Reporting-device erasure cascades through all its suggestions, including private notes. Admin audit stores decision/revision metadata, not reporter identifiers, notes or selected coordinates. Verified speed-limit and enforcement queries never read this table. Map display refreshes a coarse viewport region every 30 seconds while focused/foreground and removes stale/expired pins; no precise journey trace or device ID is sent by this map endpoint. Offline/low-data mode stops refresh; pins are not persisted.

Search uses a 200 ms debounce, cancellation of superseded requests, and the existing provider-permitted five-minute memory cache. Its cache key tolerates roughly 100 m GPS bias jitter without changing returned place coordinates. Initial uncached requests still depend on upstream/network latency. Two production probes on 2026-11-14 took 5,886 ms uncached and 284 ms repeated, respectively; these are individual measurements, not a latency guarantee.

## Validation and limits

Automated coverage includes bounded payloads, anonymous/admin authorization, concurrent duplicates, ownership isolation, review conflicts, expiry, quota and deletion against disposable local PostGIS, contributor UI, keyboard/settings Back behaviour, and admin browser review/RBAC. Browser map/GPS previews use clearly labelled fixtures. Native map gestures, symbol orientation, camera padding and road performance must be checked on the Android device; browser previews do not establish those results.
