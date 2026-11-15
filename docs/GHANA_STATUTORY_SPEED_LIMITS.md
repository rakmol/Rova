# Ghana statutory speed limits and spoken guidance

Source facts were checked on 15 November 2026 and explicitly requested by the product owner. The versioned shared catalogue is `gh-li2519-211-212-2026-11-15`, with recheck due 14 May 2027. This is an implementation review, not an assertion that legal counsel or real-road validation has occurred.

The Ghana Police TraffiTech FAQ 5.2 supplies the general 30/50/90/100 km/h framework: <https://police.gov.gh/en/index.php/traffitech-gh/>. Regulation 211 distinguishes the specified human-activity areas, built-up areas, roads outside built-up areas excluding motorways, and motorways. A Road Authority indication can change the general road default.

Regulation 212 caps loaded heavy goods at 75; buses/coaches, passengers for reward and unloaded heavy goods at 80; saloon/light vehicles at 100; agricultural/slow-moving vehicles at 30 km/h. Other motor vehicles use the regulation 211 road limit. The current legislative reproduction is <https://superlawgh.com/road-traffic-regulations-li-2519/> (identified as a reproduction, not an official publisher). DVLA's instructor manual corroborates the vehicle distinctions under the previous numbering: <https://www.transaid.org/wp-content/uploads/2025/03/Ghana-HGV-Standardised-Instructors-Manual.pdf>. Regulation 213 requires lower speeds when conditions warrant; the app does not claim to calculate a safe speed for weather, visibility or every hazard.

## Applying the rules

The result is the minimum of the applicable road limit, independently published specific vehicle caps and the statutory vehicle cap. For example, a taxi on a reviewed 100 km/h motorway is capped at 80; a loaded heavy-goods vehicle is capped at 75; a bus on a 50 km/h urban section uses 50. A documented 80 km/h sign replaces the general road default for its reviewed section, while any lower vehicle cap remains binding.

Migration 018 adds road `speed_context`, `speed_context_reference` and `default_conditions_confirmed`; every existing road starts unknown/unconfirmed. No road, rule or source is auto-approved. Road names, OSM highway tags, route-provider geometry and current vehicle speed never establish the legal category.

The admin road editor offers a classification control. The reviewer must establish the exact geometry, direction, boundaries, applicable category and Road Authority signage. Saving creates an unpublished revision. Deriving a general road limit requires published current geometry/provenance, two independent approvals for the exact classification revision, no rejection, a publication audit entry, current source evidence and unexpired review dates. Edits invalidate old approval. Signed, conflicting, pending, expired or incomplete specific road records cannot be silently bypassed by the national fallback. All prior GPS, parallel-road, ramp, junction and boundary checks remain active. Production pilot-corridor gating is preserved.

Profiles distinguish loaded and unloaded heavy goods, agricultural/slow-moving vehicles, light vehicles and passenger service for reward. A motorcycle used to convey passengers for reward must select Passenger service, not the ordinary Motorcycle profile. Generic legacy Heavy/Commercial choices remain accepted for backward compatibility but do not guess a numeric cap when it could change the answer. Vehicle type is an alert setting; routes remain general driving routes without clearance/access validation.

`GET /safety/ghana-rules` returns the sourced reference and review dates, explicitly separate from a current-location limit and camera coverage. The app exposes the reference under Settings → Navigation & voice. New default proofs and vehicle-cap provenance are returned separately from individually published road rules; no synthetic rule, source approval, audit ID or reviewer is invented. Classification-derived defaults are not newly exported for offline safety; the existing explicit-source/licence export requirements remain in force.

## Voice and validation

With fresh reliable GPS and a movement-bound verified limit proof, the app announces the current limit after stable distinct fixes. It announces a changed limit, retains existing verified upcoming-transition prompts, and speaks the applicable number plus “Please slow down safely” for sustained overspeed. Shared voice priority, turn suppression, mute, cooldown and duplicate suppression still apply. Brief proof gaps do not invent a limit or repeatedly replay the same one.

Automated coverage includes all 4 road categories × 8 explicit vehicle caps, ordinary motorcycle applicability, posted overrides, generic-profile uncertainty, stale catalogue and classification reviews, parallel roads, exact-revision approval/publication guards, spoken-limit changes and repeated same-limit road transitions. These do not substitute for passenger-assisted real-road and device audio testing.

Production coverage checked before this update: **0 nonsynthetic road records, 0 published road rules, 23,019 staged mapping geometries**. The catalogue and calculations do not turn staged geometries into verified road coverage. Road-section review and pilot activation are still necessary before real users receive GPS-specific numeric speed warnings on those roads.
