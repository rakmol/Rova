# Map interface and community contributions

The Explore screen uses a full-screen map, floating search and an expandable journey sheet. Home/Work shortcuts use the driver's existing local saved places. Destination search, route choices, Saved and Settings use the same theme and controls. Navigation has a compact instruction panel, a map with panel-aware camera/attribution placement, journey metrics and fixed Mute/End buttons. Large text, short screens and landscape use a scrollable layout instead of overlapping guidance. The travelled route remains grey and the road ahead stays highlighted.

Google Maps' official [getting started](https://support.google.com/maps/answer/144349) and [Contribute](https://support.google.com/maps/answer/9678350) documentation informed the organisation. ROVA keeps its own identity, map providers and safety labels; it does not use Google's branding, assets or map data.

Android Back closes an active destination search and restores the journey panel, or closes a Settings category/contribution form. At a top-level tab it returns directly to Explore instead of walking tab visit history. The home search also has an explicit Back arrow. The unavailable-speed card has been removed from Explore; navigation still honestly indicates unknown limits.

The bottom menu fades out/in over 200 ms with scroll direction. Its reserved space shrinks/grows with the fade, down to the Android safe-bottom inset, rather than leaving a blank strip. Hidden controls do not receive taps or screen-reader focus. Screen-reader users retain the menu while scrolling; the keyboard temporarily hides it. Dragging the journey handle resizes the panel continuously and settles at peek, compact or expanded height. A 48 dp handle also supports accessible tap expansion/collapse. Panel dragging is separate from content scrolling and does not request hiding the menu. Start navigation stays in the panel footer outside its scrollable content. Map camera padding updates at settled panel sizes, not on every drag frame.

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

## Current-position draft regression

Android permission and improved-location activities can produce a background AppState event. Contributor forms keep their selected reporting mode while their own position request is pending. On a genuine later background transition the interaction mode can require confirmation, but the opened form, text and chosen pin remain visible; editing/sending is disabled until reconfirmed. Already granted permission is checked without requesting it again. The one-shot GPS read does not launch the Android improved-accuracy settings activity; disabled location services produce an inline instruction instead.

Current-position pins must be finite Ghana coordinates with a fresh timestamp and positive accuracy of at most 50 m. Permission denial, disabled services, a 12-second timeout, stale/imprecise fixes and out-of-country positions retain the prior manual pin and draft. Position feedback appears beside its button. Leaving a form invalidates its pending asynchronous result so a late fix cannot populate another contribution. A successful submission remains a success even if its subsequent history refresh fails. No draft coordinates are written to disk by this form.

Before packaging, regression tests cover the permission/background sequence, draft retention, blocked sending after real background, permission refusal, GPS quality/timeout/bounds, late callbacks after leaving, submission failure and history failure after successful submission. These tests simulate native services; a physical-device check is still required after packaging.

## Contributor place autocomplete

The contribution name/nearby-road field searches the existing configured PlacesProvider after 200 ms while focused. It uses the same licensed proxy, cache and rate limits as destination search. Show at most six real provider matches with attribution; requests are cancelled when edited, disabled or unfocused. Empty/error states keep the driver's entered name and allow manual observations; no landmark is invented. Suggestions use a bounded scroll area with keyboard-persistent taps, and the field is brought above the keyboard.

The app permits 12 seconds for place-search transport (the server's upstream timeout remains 8 seconds), allowing mobile-network/cold-start overhead. The library's default remains 8 seconds; explicit runtime configuration supplies the grace period. A production Legon probe on 2026-11-14 returned HTTP 200 with one actual Legon match in 7,371 ms. This is one measurement, not an instant-search guarantee.

Selecting a match fills the editable name and centres the map on that area. It clears any previous observed pin and does **not** turn a suburb centroid into an enforcement location. The reporter must deliberately tap the observed place/equipment point or use a fresh current position before sending. Search coordinates remain transient view state and do not automatically become a published community record. Review/publication requirements are unchanged.

## Validation and limits

Automated coverage includes bounded payloads, anonymous/admin authorization, concurrent duplicates, ownership isolation, review conflicts, expiry, quota and deletion against disposable local PostGIS, contributor UI, keyboard/settings Back behaviour, and admin browser review/RBAC. Browser map/GPS previews use clearly labelled fixtures. Native map gestures, symbol orientation, camera padding and road performance must be checked on the Android device; browser previews do not establish those results.
