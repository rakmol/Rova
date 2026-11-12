# Unverified reported-road prompts

Enabled at the user's explicit request on 8 November 2026. These road-level awareness prompts are separate from verified speed limits, camera positions and approved corridors. They can work when the applicable legal limit remains unknown.

Migration 007 links `reported_road_advisories` to actual OSM `map_road_candidates` geometry. A dated source catalogue lives in `data/reported-road-catalogue.json`. Exact normalised road names and Accra/Kumasi bounds associate named roads; no fuzzy matches, invented suburb centroids or camera pins are created. Multiple sighting reports on one road become one **coarse whole-road association**. A report about Winneba Road/Mendskrom therefore supplies evidence of reporting about Winneba Road, not a confirmed camera at every mapped point. Road names shared by different places and map errors can still cause false positives; all prompts remain explicitly unverified.

Unmapped broad areas and roads without usable shapes stay unsupported. Named roads without speed tags may be staged with `data:roads ... --named-context`; this adds geometry context with no speed rule. Licence attribution and original revision metadata remain intact. After staging, run `npm run data:reported-roads --workspace @rova/api` with `ROVA_DATA_OPERATOR` set to the actual operator/automation. Imports are local-only. The command writes a mapping-coverage snapshot for the Reports tab, distinguishing mapped road prompts from entries without shapes; it does not represent live camera verification or enabled status.

`POST /safety/alert-context` adds optional `reportedRoads`, including notices with `verification: unverified`, `scope: named_road_not_camera`, road name, source URL/date and **road-relative** distance. No reported speed is copied into an applicable legal limit and no camera coordinates/facing direction are returned. Existing verified-limit/corridor policies remain unchanged.

Runtime safeguards:

- Recent reliable GPS, known travel heading and accuracy within 25 m; current position must align to the selected route without loop ambiguity.
- Bounded geometry retrieval within 700 m; saturation at 257 pieces suppresses notices. Route samples must follow the named road within 8 m and align within 30 degrees for at least 40 m. Adjacent pieces can form one traversal. Parallel, crossing and off-route roads normally fail this check, although close parallel roads and incomplete/inaccurate geometry can still produce missed/false unverified advisories.
- Spoken eligibility within roughly 400 m or while already on the mapped road; two distinct GPS fixes are required. Context is limited to five seconds and 100 m progress/displacement.
- Once per road per navigation session, 60-second reported-prompt cooldown, shared 12-second speech spacing. Turn instructions and verified alerts have priority; prompts wait near turns. Bad GPS, pauses, rerouting and End suppress them.

Voice: **“Reported enforcement area ahead. Unverified. Follow posted speed limits.”** Already on the road: **“Reported enforcement on this road. Unverified. Follow posted speed limits.”** The visual panel identifies the road and unverified status. It does not announce a reported 80/50/etc. as law or tell drivers to brake suddenly. Existing alert-sound and navigation-mute controls apply. Unmuting does not replay consumed warnings. No extra speech player or background tracking is added.

Reports expire 30 days after their referenced publication/update date as an operational freshness policy, not a legal validity period. Reimport does not silently refresh old dates. Operator-disabled records remain disabled; removed/unmapped associations lose their links. An operator can disable a wrong advisory using a parameterised `enabled=false` update, with an audit entry. User observations can inform corrections, but official status, legal rules and verified camera/corridor publication still require the independent evidence-review pipeline.

Server flag: `REPORTED_ROAD_ALERTS_ENABLED=false`. App flag: `EXPO_PUBLIC_REPORTED_ROAD_ALERTS_ENABLED=false`. Master compliance flags also apply. The reader role can execute only a bounded candidate function; it receives no raw staging-table grants.

Tests exercise PostGIS linkage and disable handling, alerts with unknown legal limits, exact-name grouping/city bounds, route traversal, parallel/crossing/behind/short roads, split ways, duplicate fixes, noisy/stale GPS, pause/opt-out, cooldown and priority, client validation and actual navigation-hook speech calls. Road verification on actual journeys remains pending.
