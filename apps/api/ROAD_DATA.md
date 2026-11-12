# Road data foundation and review workflow

The driver-facing matcher and compliance engine are already implemented. This workflow adds real licensed **mapping candidates**, not invented official limits. Migration `006_map_data_review_staging.sql` isolates provider snapshots from `road_segments`, `speed_limit_rules` and `driver_compliance_events`. Imports cannot approve themselves or trigger driving alerts.

## Source and current research

- [Geofabrik Ghana extract](https://download.geofabrik.de/africa/ghana.html), downloaded 8 November 2026; OSM snapshot `2026-11-07T21:21:36Z` from its replication header.
- [OpenStreetMap licence](https://www.openstreetmap.org/copyright): ODbL-1.0; retain attribution and comply with applicable share-alike obligations for distributed derived databases. Do not merge commercial data with this extract unless its licence permits the intended use.
- [Speed-limit tagging](https://wiki.openstreetmap.org/wiki/Key:maxspeed): ways can carry general, directional and vehicle-specific limits. Conditional, advisory, variable and lane-specific data need separate interpretation.
- [Osmium filtering](https://docs.osmcode.org/osmium/latest/osmium-tags-filter.html) and [export](https://docs.osmcode.org/osmium/latest/osmium-export.html) preserve actual geometry and revision metadata. Geometry may be incomplete/omitted on malformed source ways; inspect export diagnostics.

The national export has 22,773 line features with speed-related tags. The parser accepts **22,735 navigable-road candidates** and skips 38 unsupported road classes. It extracts 22,410 explicit integer-km/h rule proposals (a way may have several directional/vehicle proposals or none). These are counts of OSM ways/proposals, **not independent verified legal sections, cameras, or percentage coverage of Ghana's roads**. They include inferred/default mapping values as well as other unreviewed records. None establish legal applicability merely because a number is present.

An Accra bounding-box subset uses longitude -0.40 to 0.05, latitude 5.45 to 5.85; complete selected ways are retained, not cut at the box. A priority subset selects 428 ways with names referencing Liberation, Spintex, Nsawam, Boundary, Haatso or Ring Road. Name matching only prioritises fieldwork; it never transfers a reported speed from a news article to a map way. The source contains nearby names/variants; reviewers must inspect the actual shape and sign scope.

## Reproduce the extraction

Use the downloaded `.osm.pbf` and the documented `osmium-tool`. These are separate commands; large raw/download/review files live under ignored `apps/api/data/osm/`.

```text
osmium fileinfo ghana-latest.osm.pbf -g header.option.osmosis_replication_timestamp
osmium tags-filter ghana-latest.osm.pbf w/maxspeed* -o ghana-speed-ways.osm.pbf
osmium export ghana-speed-ways.osm.pbf --geometry-types=linestring -u type_id -a version,timestamp -f geojson -o ghana-speed-ways.geojson
```

No OSM usernames, user IDs or changeset IDs are requested in the export. The parser further restricts stored tags to road, speed, direction, relevant geometry and source metadata. The standard Geofabrik national extract excludes contributor identity fields. Avoid high-volume public Overpass queries: the initial server was at capacity and a second timed out; the national download provides a reproducible alternative.

## Operator commands

From `apps/api` (or prepend `npm run … --workspace @rova/api --` from the workspace):

```text
npm run data:roads -- inspect data/osm/ghana-speed-ways.geojson 2026-11-07T21:21:36Z
npm run db:migrate
npm run data:roads -- stage data/osm/ghana-speed-ways.geojson 2026-11-07T21:21:36Z
npm run data:roads -- review-pack data/osm/accra-priority-speed-ways.geojson 2026-11-07T21:21:36Z data/osm/accra-priority-review.geojson
npm run data:roads -- review-map data/osm/accra-priority-speed-ways.geojson 2026-11-07T21:21:36Z data/osm/accra-road-review.html
```

Staging requires `ROVA_DATA_OPERATOR` to identify the real operator/automation, e.g. `codex-data-import` for this automated import. It does **not** identify or invent a human reviewer. CLI writes are restricted to the explicit local ROVA database on port 54329, outside production. Credentials stay in the existing server environment and are not printed. No public import/publish endpoint or approval-bypass command is added.

GeoJSON input is capped at 64 MiB/50,000 features/20,000 points per geometry. Supported navigable highway classes only; WGS84 and nondegenerate geometry are required. Original way/version/edit timestamp, retained tags, geometry, source link and immutable fingerprint are preserved. Osmium Unix-second edit timestamps are converted to ISO; they **never** become legal effective dates or review dates.

Only explicit integer km/h values 1–200 are proposed. Other units, implicit strings, multiple values and unsupported vehicle tags stay unresolved. General/directional/vehicle proposals retain their original tag/value. Conditional, lane and variable limits, roundabout direction, oneway conflicts, mapped defaults and every unknown evidence/accuracy/applicability field are flagged. No proposal is approved, assigned invented confidence, or given a fabricated effective date. Null/unsupported values never turn into a default 80.

Imports use transactions and 250-record chunks. Repeating the same file is a no-op. The same way/version cannot silently change its source fingerprint; a conflict rolls back the batch. New provider versions are separate snapshots. Staging rows and batches are immutable and the records have audit entries. The driver read role receives no raw staging grants. A separate reviewed legal record must be created through the existing controlled workflow.

## Evidence collection and release

Open `data/osm/accra-road-review.html` in a browser. It includes searchable actual road shapes, source-history links, mapped proposals, missing-evidence flags and local-only notes. It uses no remote basemap or uploads. Start/end indicate OSM way order, not the legal start/end of a restriction. Download annotated GeoJSON before closing; notes otherwise remain only in memory. This file cannot publish or approve rules.

For each release candidate, establish:

1. The legally applicable sign/authority document and dated evidence, including amendments/temporary restrictions. A map edit date or blog article is not this evidence.
2. The precise start/end geometry, permitted travel direction, vehicle class and any conditional restrictions. Split a mapped way if a legal boundary lies inside it.
3. Positional accuracy, road width, grade/junction context and review of adjacent/parallel roads. This speed-tag-only export is **not** a complete road network: include untagged neighbouring roads in the ambiguity model before publishing. Do not use absence of speed tags to exclude a competing road.
4. Actual effective/expiry and review dates, confidence supported by evidence, and two independent authenticated human reviews under the existing publication controls. The current local operator tools do not supply production reviewer authentication.
5. Test GPS matching, overspeed/voice behaviour and route transitions on actual Accra roads before relying on the released sections.

Promote only reviewed legal road/rule records; retain the provider/source references and audit trail. Do not automatically approve a source as official because it came from OSM. Field-audited signage and authoritative records follow their distinct provenance paths in the existing safety pipeline. No blanket national limit is inferred.

Camera data remains separately managed in `enforcement_zones` and `driver_compliance_events` with its own source, geometry, direction, type, expiry and approval requirements. Public named-area camera reports remain unverified reference material. This import does not turn ordinary traffic signals into cameras or publish unofficial precise mobile-camera positions. The review template starts with an empty camera-record list; missing locations are not invented.

## What ROVA currently offers

Implemented in the development app: street/landmark search through the configured provider, destination details/pins, route options with distance/static ETA, GPS navigation, turn instructions and device speech, GPS speed, vehicle-class selection, alert audio opt-out, and the sourced public-report catalogue. Route estimates are not Ghana live-traffic claims; the app is not connected to Police ticket/evidence systems.

The verified road-matching API and sustained overspeed/transition/corridor alert engines are implemented and tested. They produce real location-specific safety warnings only when released records meet their evidence and matching requirements. Newly staged OSM candidates do **not** provide that release. The live database's published rule/event counts must be checked separately; do not claim national coverage or fully dependable voice/lane navigation from importer success.

Tests cover explicit/unsupported units, directional/vehicle tags, conditions, privacy metadata, geometry validation, revision identity, atomic deduplication/rollback, immutable staging, ODbL attribution, evidence blanks and review-page injection protection. The real PostGIS test proves staging does not populate driver-facing tables.
