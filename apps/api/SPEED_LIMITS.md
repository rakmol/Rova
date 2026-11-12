# Verified speed limits and conservative road matching

`GET /safety/speed-limit` is a data lookup, not a source of invented statutory defaults. It returns a number only after road, evidence, review, freshness and applicability gates pass. This backend feature does not pause navigation or change GPS readings. It does not import or use a TraffiTech camera database, enforcement-zone records, or mapping-provider speed annotations.

## Request and responses

Required query parameters: `lat`, `lon`, `accuracy` (meters), `vehicleType`. Vehicle types are `private_car`, `taxi`, `motorcycle`, `commercial_vehicle`, `bus`, `heavy_vehicle`. Supply `heading` (travel course clockwise from true north, 0 inclusive to 360 exclusive) and **`timestamp` (GPS fix Unix milliseconds)** for any verified response. Missing timestamp/heading returns unknown; the server never silently treats an old location as a current reading. Omit an unavailable course instead of inventing zero or using the direction a stationary phone happens to face.

```javascript
// location.timestamp is the original device fix time, not Date.now() substituted later.
const query = new URLSearchParams({
  lat: String(location.latitude), lon: String(location.longitude),
  heading: String(location.course), accuracy: String(location.accuracy),
  timestamp: String(location.timestamp), vehicleType: selectedVehicleType,
});
const result = await fetch(`${apiOrigin}/safety/speed-limit?${query}`).then(r => r.json());
```

A verified response contains `status: "verified"`, `speedLimitKmh`, `units: "km/h"`, `segmentId`, `vehicleType`, record `confidence`, `matchedDistanceMeters` and `rules`. Each contributing rule includes its ID/revision, recorded limit, role/evidence category, effective/expiry dates, last review time, oldest independent approval time, approval count, immutable audit-log reference and source document/reference/public URL. Record confidence is not a statistical probability that the GPS road match is correct.

An unknown response always has a **null numeric limit**:

```json
{
  "status": "unknown",
  "speedLimitKmh": null,
  "units": "km/h",
  "reason": "ambiguous_parallel_roads",
  "message": "GPS uncertainty overlaps parallel roads or a nearby ramp."
}
```

Unknown/missing/ambiguous/stale data returns 200. Malformed inputs or unsupported vehicle names return 400; database/service failures return 503 with unknown/null rather than a cached or default number. The endpoint permits 60 requests/IP/minute and uses no-store HTTP caching. Logs omit coordinates, query strings and raw database failures. GPS age and legal validity are checked again after the database query, so a slow query cannot return a verified result for a now-stale fix.

No authentic speed-limit dataset has been loaded by this implementation. The local synthetic demo remains excluded. A lookup can therefore legitimately return `no_road_match` until real geometry and evidence have been curated and reviewed.

## Data pipeline

1. **Intake as draft.** Use the existing authorized development import for actual sourced documents/CSV records. It records the issuing source, document/reference, URL when available, geometry, direction, vehicle class, km/h value, effective/expiry dates and transactional audit events. Incomplete intake may remain draft; it is never a served verified limit. Reference-only evidence must be mapped to an accurately located segment before GPS lookup can use it.
2. **Curate geometry and applicability.** Record `road_kind` (`road`, `ramp`, `service`), measured `road_width_meters` (1–60), `accuracy_meters`, confidence, direction, grade level if known and `last_reviewed_at`. Confirm which exact segment and direction the rule covers. Do not copy a nearby main-road limit onto a ramp. Missing width/accuracy/classification prevents verified lookup.
3. **Classify the evidence.** Explicitly set rule `units='km/h'`, `evidence_type` (`posted_signage`, `official_record`, `general_default`), `legal_applicability='confirmed'`, role, source reference, confidence and `effective_from`. Expiry may be null when the real evidence has no known end date; do not invent a legal expiry. Unsupported unit systems are rejected, not guessed or silently converted.
4. **Review and publish deliberately.** Review/approve the actual source and road; then obtain two distinct reviewers excluding the rule creator for its current `revision`. Record `last_reviewed_at` and publish with independent approved/verified reviewer metadata. Application review/authentication is still a separate workflow; production intake remains disabled until proper organization authorization is available. Nothing in the import endpoint auto-approves or publishes.
5. **Maintain evidence.** Re-review or withdraw records when signs/documents change. Use an explicit `supersedes_rule_id` for a reviewed replacement with compatible road, vehicle, direction and role scope. Preserve old rules and audit history. A rule's content changes increment its revision, and earlier approvals no longer count for the new revision. Review decisions are timestamped by the database and every insert/update/delete decision produces an immutable audit event.

Migration `004_verified_speed_matching.sql` adds these metadata/revision fields and returns existing approved/published limits to pending review because the new legal-applicability and review metadata is initially unknown. It never fabricates review dates: old approval timestamps are copied from their original creation times. Changes to material rule content require leaving published/approved state. Reviewers must explicitly target the current revision; approval history stays available. Supersession cannot form a cycle or cross to another road/role/unsupported vehicle/direction scope.

Spatial review and publication controls are enforced in PostgreSQL, and the API applies additional conservative serving thresholds. A published database status alone is insufficient to serve a number. The response's audit reference links to `audit_logs`, not an unauthenticated audit-inspection endpoint.

## Road matching policy

- Accept only a fix at most **10 seconds old**, at most two seconds in the future, with positive GPS accuracy at most **25 m**, and an available travel heading.
- Use parameterized PostGIS geography queries within **100 m**, with a functional GiST index. Geography distances are meters; local tangent heading is computed around the closest point rather than using an entire curved road's end-to-end heading. Queries are bounded to 17 roads and 17 relevant rules per road; hitting either cap returns unknown rather than choosing from an incomplete result.
- Exclude synthetic geometry, but retain nearby unverified roads when examining ambiguity. Each possible road corridor includes **twice reported GPS uncertainty + recorded geometry uncertainty + half the road width**. Unknown width/geometry quality uses conservative uncertainty for ambiguity detection and cannot qualify as a verified match.
- If more than one corridor can explain the position, return unknown. Parallel carriageways and ramps remain ambiguous even if one lacks verified limits. Crossing headings or nearby branch endpoints produce junction ambiguity. Different known grade levels remain ambiguous because this endpoint has no altitude/road-level observation.
- Never skip the closest physical road just because another road's legal direction happens to fit the heading. Once one corridor remains, require heading within **35 degrees** of an allowed forward/reverse tangent. Apply a directional rule only to that direction of travel.
- Near a segment endpoint (within the uncertainty corridor, minimum 10 m), return unknown rather than extrapolating coverage past the end of a rule's geometry.
- Require a published real road, confidence at least **0.9**, recorded geometry accuracy at most **10 m**, measured width, classified kind, a review within **365 days**, and an approved/current real source. These thresholds are operational policy, not legal or GPS-precision guarantees.

PostGIS inputs are WGS84. The method is conservative single-fix matching, not lane-level or historical probabilistic map matching. It depends on sufficiently complete, correctly scoped local road data. It cannot detect an entirely unmapped road or establish which deck of an overlapping flyover the device occupies. Very wide roads, missing geometry and dense junctions can intentionally produce unknown. Validate the policy against actual Accra road/GPS traces before relying on it operationally.

## Legal applicability and rule priority

Only **current, legally confirmed** rules for the matched segment, requested vehicle (or `all`) and travel direction can participate. Each selected rule must be published, non-synthetic, have a supported unit/value, confidence at least 0.9, an effective start date, recorded review within **180 days**, two independent current-revision approvals with current review dates, an audit reference and a current approved source. Sources themselves need review within **365 days** and must not be expired/future-dated or withdrawn.

The resolution policy is:

1. Apply explicit compatible **verified supersession** first. An unverified current proposal to replace an applicable rule yields `pending_supersession`, rather than silently trusting either the old or proposed value.
2. Among road limits, prefer legally confirmed segment-specific **posted signage**, then **official records**, then an explicitly sourced and reviewed **general default**. Within the same evidence tier, an exact vehicle rule has priority over an `all`-vehicle rule.
3. If equally ranked current records disagree, return `conflicting_rules`. An unverified/stale higher-tier record does not cause fallback to a lower-tier default.
4. Apply independently verified `vehicle_cap` rules as additional binding maxima; the returned limit is the minimum of the selected road limit and applicable vehicle caps. An unverified applicable cap yields unknown. This avoids ignoring a lower vehicle-class restriction just because a road sign allows a higher general speed.

This is an evidence-resolution design, **not a statement of Ghana's statutory hierarchy**. Human reviewers must establish actual legal applicability, document amendments and temporary restrictions. A verified explicit replacement can supersede an older sign record. Do not confirm conditional rules whose time, weight, weather or other conditions cannot be established from this endpoint's inputs; leave them unconfirmed until that context is modeled. Field-audited signage needs actual documented legally applicable signage; crowd reports and mapping-provider annotations alone cannot establish an official limit. General defaults are never hard-coded or inferred from road names/classes.

## Unknown reasons

GPS: `timestamp_required`, `stale_gps`, `future_gps`, `poor_gps_accuracy`, `heading_required`.

Matching: `no_road_match`, `ambiguous_parallel_roads`, `ambiguous_junction`, `ambiguous_levels`, `near_segment_boundary`, `heading_mismatch`, `too_many_candidates`.

Evidence: `unverified_segment`, `low_confidence_segment`, `stale_segment`, `no_applicable_rule`, `unverified_rule`, `low_confidence_rule`, `stale_rule`, `unverified_source`, `stale_source`, `conflicting_rules`, `pending_supersession`, `unsupported_units`, `too_many_rules`.

Infrastructure: `service_unavailable` (503). No unknown response contains an estimated or fallback speed limit.

## Verification and access

Run `npm run db:migrate` for migration 004, then the API build and tests. For real database integration, use the API guide's explicitly disposable local `rova_test_*` database and `TEST_DATABASE_URL`. Unit fixtures and simulated official-review records exist only in automated tests in that isolated database; they are not seeded into the application database. The only application seed is permanently synthetic and cannot be verified.

Tests cover ramps, unverified and opposing parallel roads, junctions, grade ambiguity, segment boundaries, poor/stale GPS, slow-query staleness, unverified rules, old reviews, expiry, source trust, conflicting rules, legally confirmed priority, vehicle caps, supersession scope/cycles and revision-specific approvals. Real PostGIS/HTTP tests exercise candidate retrieval, ramp geometry and end-to-end known/unknown responses. `rova_reader` can execute the bounded security-definer candidate function without gaining raw safety-table access; its fixed trusted search path and argument limits prevent arbitrary SQL/spatial scans. Endpoint callers never receive the internal candidate list.
