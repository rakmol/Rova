# Map interface and community contributions

The Explore screen uses a full-screen map, floating search and an expandable journey sheet. Home/Work shortcuts use the driver's existing local saved places. Destination search, route choices, Saved and Settings use the same theme and controls. Navigation has a compact instruction panel, a map with panel-aware camera/attribution placement, journey metrics and fixed Mute/End buttons. Large text, short screens and landscape use a scrollable layout instead of overlapping guidance. The travelled route remains grey and the road ahead stays highlighted.

Google Maps' official [getting started](https://support.google.com/maps/answer/144349) and [Contribute](https://support.google.com/maps/answer/9678350) documentation informed the organisation. ROVA keeps its own identity, map providers and safety labels; it does not use Google's branding, assets or map data.

Android Back dismisses the keyboard first, closes a Settings category or contribution form next, and then follows tab visit history. Road reports remain accessible from Contribute; they no longer add a fifth visible bottom tab.

## Contribution flow

Guests can submit a place or observed fixed enforcement equipment without signing in. Existing anonymous reporting credentials are encrypted on the phone and used for ownership. Road hazards continue through the existing incident submission and moderation system.

1. Confirm parked/passenger interaction. The existing driving gate blocks forms during driving unless passenger mode is selected.
2. Enter a bounded name/category, deliberately select a Ghana map pin (or request one current GPS reading), and optionally describe the observation and travel direction. No route history is collected. Mobile enforcement positions and supplied verification flags are rejected.
3. `POST /v1/incidents/contributions` stores a **pending suggestion**. The service limits submissions to 5/device/hour and 20/IP/hour, with a bounded HTTP body and persistent quotas. Concurrent own duplicates within 50 m are deduplicated without revealing other reporters' records.
4. `GET /v1/incidents/contributions/mine` returns up to 30 active suggestions belonging to the reporting installation. There are no public coordinate/list endpoints for these suggestions.
5. Reviewers/administrators use **Community contributions** in the admin dashboard. Review requires a comment and current revision; conflicts/expired records are rejected. Decisions create an audit entry.

**Reviewed is not authority verified.** This inbox does not automatically publish places into licensed provider search results, add enforcement warnings or establish a legal speed limit. Operators must use the existing sourced, independent approval workflow to publish eligible safety records. There is no fabricated confirmation, speed, coverage or contribution score.

## Database and privacy

Apply `016_community_contributions.sql` through the checksum migration runner. The separate table uses WGS84 point geometry and a spatial index, strict Ghana bounds, row security and revoked browser/Supabase role grants. The API database identity owns access; driver auth never grants admin access.

Suggestions expire after 90 days, are excluded from reads/reviews after expiry and are deleted by hosted/CLI maintenance. Reporting-device erasure cascades through all its suggestions, including private notes. Admin audit stores decision/revision metadata, not reporter identifiers, notes or selected coordinates. Navigation and safety queries never read this table.

## Validation and limits

Automated coverage includes bounded payloads, anonymous/admin authorization, concurrent duplicates, ownership isolation, review conflicts, expiry, quota and deletion against disposable local PostGIS, contributor UI, keyboard/settings Back behaviour, and admin browser review/RBAC. Browser map/GPS previews use clearly labelled fixtures. Native map gestures, symbol orientation, camera padding and road performance must be checked on the Android device; browser previews do not establish those results.
