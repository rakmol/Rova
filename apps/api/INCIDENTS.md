# Community road incidents

Apply migration 008 with `npm run db:migrate --workspace @rova/api`.
Set private API configuration `INCIDENT_IP_HASH_KEY` (stable random 32+ characters,
required for production reporting) and `ROVA_INCIDENT_MODERATOR_TOKEN` (32+ characters).
Do not put either secret in Expo or NEXT_PUBLIC variables. An absent moderator token
disables moderation; production reporting fails closed without the hashing key.
Admin UI: `/incidents` in the operations app; enter the moderator credential in memory.
The optional `db/roles.sql` provides `rova_incident_writer` for incident service writes
without road/source writes. Production must grant the appropriate roles to its managed
API login (or isolate the incident service); the local development login owns the schema.
This is a shared operator credential; replace with individually authenticated moderator
identities before a public multi-moderator rollout. No moderator routes use the Expo tunnel.

## API contract

All coordinates are WGS84, currently bounded to Ghana (-4..2 longitude, 4..12 latitude).
Every endpoint sends Cache-Control: no-store. Use HTTPS except local loopback development.

* `POST /v1/incidents/session` `{platform: "android"|"ios"|"web"}` -> 201
  `{token, expiresAt}`. Random anonymous 30-day bearer; only its SHA256 is persisted.
* Other community endpoints require `Authorization: Bearer <session token>`.
* `POST /v1/incidents` `{category,fix:{lon,lat,accuracy,timestamp},interaction,note?}`
  -> 201 `{id,duplicate:false,notice}` or 200 `{id,duplicate:true,notice}`.
  Categories: pothole, flood, collision, closure, congestion, obstacle.
  `interaction` is parked or passenger; fix age <=60 seconds, GPS accuracy <=50 m.
  Timestamp is Unix milliseconds. Optional note <=280 characters, moderator-only.
* `GET /v1/incidents/nearby?lon=&lat=&radius=2000`: radius 100..5000 m,
  maximum 50 nearest active reports; includes pending reports explicitly unverified.
* `POST /v1/incidents/:id/votes` `{decision:"confirm"|"not_there",fix,interaction}`
  -> 201 updated CommunityIncident. Within 500 m only, one immutable vote per
  anonymous installation, no self-vote. Expired/rejected/repeated votes ->409.
* `GET /v1/admin/incidents?status=pending` with private moderator bearer:
  up to50 reports with private notes. Status filters also support verified, rejected,
  expired; optional ISO datetime `before` for older records.
* `POST /v1/admin/incidents/:id/moderate` with moderator bearer:
  `{revision,status:"verified"|"rejected",reason}`. Reason10..500 chars.
  Optimistic revision check prevents lost decisions (409 on conflicts/expiry).
  Decision and reason are written atomically to the append-only audit/moderation trail.

Returned report: id, category, status, coordinate, approximateRadiusMeters, reportedAt,
expiresAt, revision, confirmations, notThere, confidence, evidence="community",
authorityVerified=false. "verified" here means moderator-reviewed community evidence,
never official authority provenance. UI always uses amber COMMUNITY labels, including
reviewed reports. Public responses never include notes, device IDs or reporter IDs.
Confidence is the heuristic `(confirmations+1)/(confirmations+notThere+3)`, rounded to
two decimal places, not a calibrated probability. Votes cannot auto-approve/reject;
two or more not-there votes at least equal to confirmations return reviewed reports
to pending. Each accepted vote changes revision and stored aggregate confidence.

## Abuse, safety and privacy

Same-category submissions within180m of an active incident return an existing ID;
they do not count as a confirmation or extend expiry. A transaction advisory lock
prevents concurrent duplicate creation. Hourly quotas:5 submissions/device and20/IP;
20 votes/device and60/IP. Session issuance5/IP/day. Durable buckets prevent restarts
from resetting quotas; the API also has per-route and global IP limits. IP bucket
keys use HMAC, never raw IP persistence. Shared networks can hit shared limits.
Anonymous identities can be reset/reinstalled; this deters casual abuse, not determined
Sybil attacks. Public scale needs identity/attestation and operational abuse review.

The app requires parked/passenger selection and a fresh location. Parked mode needs
GPS speed below1.4 m/s; unknown speed asks the user to retry or use a passenger.
Foreground exit clears the interaction choice. No voice input yet. Server assertions
cannot prove someone is actually parked/passenger. No report queues or automatic
submission retries. GPS is requested per action; no reporter travel trace is collected.

Coordinates are rounded to0.001degrees (~110m grid in Ghana) on the phone before
transmission and again on the API; stored/public uncertainty150m. This reduces location
precision; it is not a guarantee of anonymity. Approximate vote/query coordinates are
not stored. Observations are timestamped by the server to the minute. API logs omit
coordinates/bodies. No public reporter history endpoint exists. Private reporter
association permits anti-abuse checks. Notes are private, rendered as text, and may
contain personal information; UI asks users to omit it.

Expiry: potholes24h, flooding4h, collisions2h, closures6h, congestion30m, obstacles4h.
Expiry is enforced at every read/write even if maintenance has not run. Votes never
extend it. Schedule `npm run incidents:maintenance --workspace @rova/api` daily to
materialize expiry, remove quota buckets older than2days and expired sessions, and
remove private notes/reporter associations/votes7days after incident expiry. Configure
that job in the deployed environment; this repository does not provision a scheduler.
No synthetic seeds are added. Incident reports never become speed limits, camera
alerts, automatic detours, or authority-published safety data.

## Mobile connection

Set `EXPO_PUBLIC_INCIDENTS_API_URL=https://your-api/v1/incidents` for a packaged app.
Development uses the Expo tunnel `/rova-api/incidents` proxy. Restart Metro after
changing metro.config.js. The app stores only its expiring anonymous session token,
not coordinates, votes or notes. It uses existing native modules: no new APK required
for a connected development build. Test parked/passenger behavior on real devices.
