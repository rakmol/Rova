# ROVA QA and safety acceptance

## Present decision: NO-GO for a production safety/navigation release

This package is a strategy, executable evidence runner and acceptance checklist, not
a report of completed real-road testing. All21 manual cases in `field-template.json`
start **not_run**. No physical Android phone, low-end device, actual radio transition,
tunnel, highway, battery trial, penetration test or production alert drill was operated
by this agent. User screenshots and previous “it works” messages are useful defect
reports; they are not an exact-build signed road-test acceptance record.

The existing development APK is a development client. It is not proof that standalone
cold/offline launch, dependable lane guidance, Ghana-wide safety coverage or background
push delivery works. Firebase remains deferred; English human copy/pronunciation
review is pending; sponsorship delivery/collection remains locked. These are explicit
limitations, never silently converted to passes.

## Traceability and evidence rules

- [TRACEABILITY.md](TRACEABILITY.md) is the readable requirement/suite/manual/gate map.
- [matrix.json](matrix.json) contains25 requirement mappings,21 executable-by-a-human
  protocols and7 release gates. Each manual case specifies steps, expected behaviour
  and required evidence. `npm run qa:check` verifies all referenced test files/cases.
- [field-template.json](field-template.json) is an **unexecuted** recording template.
  Copy it into the same evidence-run directory as `automated.json` before completing
  real tests. Do not modify the template to suggest tests have run.
- Original stage01–04 prompts are unavailable in the supplied history. The map covers
  stages05–19 and the reported map/keyboard problems; reconcile original01–04 acceptance
  criteria before claiming complete traceability for the entire product.
- Every result needs the exact source fingerprint, APK SHA256/version/signature/build
  profile, device/OS/RAM/minSdk, relevant dataset/source version, provider/configuration
  revision, tester, UTC timestamp, independent reviewer and hashed supporting artifacts.
  App version alone is insufficient: development JS can change without reinstalling.

The automated fingerprint covers application/shared sources, tests, migrations,
configuration, mobile assets and QA definitions. Generated bundles, reports, `.env`
secrets and live database contents are excluded. Record the deployed data versions and
privacy-safe configuration inventory separately. Freeze a release candidate: changing
code/assets/configuration invalidates the automated source identity; altered evidence
files invalidate their hashes. Hashes establish integrity, not that a human genuinely
performed a road test. An accountable reviewer must inspect the evidence itself.

No screenshot alone proves a whole journey, no Expo push receipt proves phone display,
no20 event count proves20 people, and no mock test establishes Ghana provider coverage.
“Blocked”, “not_run”, “failed”, flaky or missing results cannot satisfy a gate. A field
result needs an observation and artifacts, not just the word “passed”.

## Test pyramid and execution environments

| Layer | Scope | Evidence and limits |
| --- | --- | --- |
| Unit | GPS projection/progress, stale/jump/heading filters, wrong-way confirmation, overspeed hysteresis/cooldowns, voice coordination, cache expiry, reminders/timezones | Synthetic fixtures labelled as tests; never production safety records |
| Contract | Strict Zod/API/provider shapes, auth failures, static ETA/toll metadata, unknown states, timeouts, rate limits, secrets redaction | Mock transport/provider failures; no claim of live service coverage |
| Integration | Real disposable PostgreSQL/PostGIS, migrations/checksums/rollback, geometry, reviewed publication, ownership/deletion, spam/expiry, notification queues, sponsorship lock | Existing application/production databases are never reset |
| UI | React Native controls and accessibility semantics, keyboard/results, route choice, driving guard; real browser admin role/CSRF/review/revert workflow | Component tests are not physical-device pixel/TalkBack acceptance |
| Build | All-workspace TypeScript, mobile lint, API/admin builds, Android JS export | Successful JS export is not successful native install or road validation |
| Device/bench | Exact standalone APK, permissions, TTS, native storage/scheduling, replay faults, radios, offline cold launch, resources | Physical evidence on supported devices required; simulated radio is labelled lab shaping |
| Road | Passenger-observed urban/suburb/junction/ramp/parallel/highway/covered segments at lawful speeds | Pre-reviewed route/reference pack, independent safety observer, stop conditions and source evidence |
| Operations/security | Auth/secret/dependency assessment, actual monitored deployment, outage/alert/acknowledgment/rollback drills | Must be performed with authorized test accounts and approved failure injection |

Use three physical supported Android devices: (1) a budget/small-screen device around
2–3GB RAM if supported by the built APK, (2) a representative midrange Android13+
device for runtime notification permissions, and (3) a recent higher-end device/OS.
Confirm the actual APK manifest minimum SDK before selecting the oldest OS; do not
guess SDK support. Include different manufacturers and GPS/radio chipsets where
possible. At least one device must support gesture navigation and one three-button
navigation. Test100%/200% fonts, day/night, battery saver and denied/approximate location.
Do not lower the app's minimum supported OS to accommodate an unsupported test phone.

## Safe road protocol

1. Assign a driver whose only task is lawful safe driving and a passenger/tester who
   operates the mounted test phone. An additional observer is preferable. No handheld
   driver interaction, reading test forms, screen recording controls or live debugging.
2. Plan the route while parked. Choose lawful, permitted, reasonably safe sections
   with independently documented signs, directions, intersections and reference
   geometry. Validate current signs/conditions; do not invent camera coordinates,
   speed limits, highway coverage or tunnel locations to fill a test case.
3. Record device/build/dataset identity and permitted observation consent first.
   Stop driving before setup, reporting, account changes or test reconfiguration.
4. Stay within posted/applicable limits. **Never deliberately overspeed, drive against
   traffic, stop dangerously, enter flooding/closures or brake suddenly to test ROVA.**
   Wrong-way and overspeed fault injection belongs in an isolated replay/bench or a
   properly authorized closed course. Mark the environment accurately.
5. Driver follows signs, law and safe judgment independently of the app. Stop the test
   immediately for unsafe maneuver advice, distracting repeated alerts, heat/instability,
   obscured critical controls, unsafe weather or any participant discomfort.
6. Passenger logs observations/times; review recordings later while parked. File a
   critical defect for a false known limit, confirmed-looking unverified marker,
   sustained bogus overspeed warning or unsafe route instruction. Preserve evidence,
   stop the affected scenario and withdraw/disable the faulty feature/data as needed.
7. Re-run repaired scenarios on the same conditions/device and then representative
   alternatives. Never erase a failed result; link it to the fix and retest evidence.

Real-road positive speed-limit tests need an independently reviewed source/reference
pack. If ROVA has no verified data on that road, the correct behaviour is **unknown**.
Test that honestly; record positive coverage as blocked, rather than importing a
synthetic verified rule into production or declaring a guessed80km/h default.

## Scenario coverage and measurable acceptance

Read the full steps/expected/evidence arrays for M01–M21 in `matrix.json` before each
test. The following measurements supplement them. These are **provisional QA targets**,
not measured product performance or promises; agree stricter device-specific targets
before freezing the candidate and keep the approved target sheet with evidence.

| Area | Method / provisional target | Mandatory safety response |
| --- | --- | --- |
| GPS drift/stationary jitter | At least10 minutes per noisy replay, stale/future timestamps,30–200m drift, teleport jumps and heading jitter; count all cues/progress jumps | Zero bogus known limits and zero sustained false overspeed; no fresh-looking speed from stale fixes |
| Covered/tunnel loss | Record last reliable fix, first unknown state, first recovered reliable progress and GPS age/accuracy; use a real identified covered site where safely available | No invented motion/limit or reroute spam; retain understandable route and recover conservatively |
| Parallel roads/ramps/junctions | Repeat both lawful directions and vehicle classes against reviewed geometry/sign evidence; include ambiguous grade-level cases | Unknown when ambiguous; never jump to a convenient verified parallel segment |
| Wrong direction | Confirm with isolated multi-fix replay plus legal route-recovery observations; record reroute count and intervals | One noisy heading cannot cause a loop; no instruction to perform an illegal reversal |
| Limit transitions | Compare referenced sign boundary, permitted direction/class/date, warning distance and displayed limit | Applicable signs/official records prevail; unknown/expired/unverified records cannot become numeric |
| Voice | Capture upcoming maneuver + safety + community simultaneous sequences, arrival, mute and phone/TTS interruption | No overlap/stale replay or spam; maneuver priority; no “brake now” instruction |
| Startup/map | Ten cold/warm trials per device with fixed network; warm first usable guidance goal10s, cold reliable location goal60s where sky view allows; record median/p95 and cache state | Target miss requires investigation; never fake a fix to meet a timing goal |
| Routing/provider | Record warm/cold search/route latency, no-result, HTTP429/5xx, timeouts and provider outages; budgets/coverage reviewed | Static ETA labelled estimate; unavailable route/search stays honest; no sample fallback in production |
| Radio/low data | Actual available2G/3G/4G/Wi-Fi handoffs and separate lab profiles:128kbps/800ms/5%loss and1Mbps/200ms/1%loss; record settings | No retry storm, duplicate streams, expired alerts or fake congestion; unsupported radio is blocked |
| Offline | Fresh/stale/mismatched/partial/corrupt packs, airplane mode, reinstall/reboot and cold launch without Metro | No stale numeric limit; incomplete cache cannot replace complete data; no full-offline routing promise |
| Battery/thermal | Three paired30-minute baseline/navigation trials per device and90-minute soak; fixed brightness/radio/volume/ambient, no charger | No ANR/crash/critical thermal state; provisional drain ceiling20 percentage-points/hour, explain measurement uncertainty and investigate excess |
| Memory/lifecycle | Record RSS/PSS and watch/network activity before/during/after navigation, background/foreground and long voice bursts | No unbounded growth or continued unnecessary location/speech work after end |
| Spam/moderation | Controlled test-only bursts, duplicate/conflicting votes, spoofed GPS, expired/unapproved reports and large payloads | Quotas/auth/expiry hold; report cannot self-verify or reveal precise reporter history |
| Deletion | Phone store/scheduled notification inspection, API owner checks, provider acknowledgment and offline retry | Queued deletion remains pending; documented anonymous/audit retention is disclosed separately |
| Permissions/native UX | Denied/revoked/approximate location, no TTS, notifications/channels off, battery saver, safe bars and keyboard | Guest navigation survives; no permission loop, fabricated location or hidden safety controls |

For resource tests record battery state-of-health, starting percentage (prefer50–90%),
temperature, screen brightness, carrier/signal, device power settings, other apps and
whether diagnostics themselves add overhead. Percentage readings alone are coarse;
compare repeated paired trials and native power statistics where available. Heat and
driver safety override completing a90-minute soak. Do not infer battery performance
from watcher cleanup unit tests.

## Go/no-go gates

| Gate | Release-blocking condition | Required evidence |
| --- | --- | --- |
| G01 Unknown/known truth | Any unknown, ambiguous, unreviewed, expired or wrong-class limit displayed/spoken as applicable known | Matching/expiry automated tests + M04/M06/M07/M20 |
| G02 Enforcement truth | Any unverified reported area/camera/traffic-light claim presented as confirmed authority data | Compliance/report tests + M09/M20 |
| G03 Guidance/overspeed safety | Sustained bogus alert, unsafe maneuver, progress jump, wrong-way loop or stale/overlapping guidance | Navigation/voice/alert tests + M04/M05/M06/M08/M21 |
| G04 Deletion/privacy | Undeclared personal retention, failed cancellation/revocation or queued deletion falsely reported complete | Ownership/cache/account/notification tests + M14/M17 |
| G05 Security | Open critical/high defect, auth/CSRF/role bypass, exposed secret, unreviewed safety publication or sponsor activation | Contract/PostGIS/browser checks + M13/M15/M18/M20 and security review |
| G06 Monitoring | No actual continuous monitoring, approved alert/acknowledgment drill, on-call owner or rollback evidence | Probe/log/metric tests + M19 and operations acceptance |
| G07 Devices/accessibility/resources | Unsupported/native-crashing APK, missing representative physical tests, obstructed controls, unreviewed English or unacceptable resource/radio behaviour | Physical device matrix + M01/M02/M03/M10/M11/M12/M16 |

Zero tolerance for known/unknown or enforcement truth violations. A developer cannot
waive a critical safety/security/privacy defect by adding a note to the release form.
Block a general release until independent safety, security/privacy, operations and
product owners accept current evidence. Default full-scope acceptance requires all
manual cases to pass. A narrower release with disabled features needs a separately
reviewed scope/traceability change; do not mark unavailable Firebase/radio/road tests
as passed or add an undocumented skip list.

For the M15 secrets check, “provider/server keys” means **private** provider credentials,
service-role keys, signing material and access/refresh tokens. Documented publishable
Supabase keys or scoped public Mapbox client tokens can be intentional client
configuration; inspect their permissions/origin restrictions and never treat them as
server authorization. Their intentional presence is not automatically a secret leak.

## Existing monitoring versus required operational acceptance

Already implemented: `/health`, database/PostGIS/migration `/ready`, request-ID-based
structured logs with route/method/status/duration and bounded errors; secrets/query/
raw GPS redaction; moderator-only aggregate realtime connection/error/bytes/backpressure
and database latency metrics at `/v1/admin/incidents/realtime-metrics`.

`npm run qa:probe` makes two read-only bounded checks of a configured origin and
records status/timing/headers, never a route, token or GPS coordinate. Its default
target is local. This is **not** an installed production monitoring service, crash
dashboard, alert subscription or proof someone received an alert.

Before release, M19 must establish and test: synthetic health/readiness checks at an
approved cadence (suggest60s, alert after3 failures), bounded provider availability/
quota checks, API5xx/latency and realtime error/backpressure dashboards, stale source/
dataset expiry visibility, privacy-reviewed crash/ANR observation, named on-call rota,
delivery/acknowledgment of a controlled alert and a rollback/source-withdrawal drill.
Suggested review triggers: readiness loss, sustained5xx over1%/5min, latency outside
the approved endpoint budget, repeated authentication abuse, approaching provider
quota, invalid source freshness or new critical crash cluster. Calibrate from actual
baseline traffic; do not invent counts or a production SLO from local mocks.

Inject faults only in isolated/staging systems with permission. Do not disrupt the
live API or send messages/pages to others without explicit authorization. Evidence
must identify the environment; a localhost probe cannot pass production monitoring.
Rollback/disable suspect data using reviewed source withdrawal, and disable the
affected feature/service if data/guidance cannot be trusted. Preserve redacted audit
evidence and restore a known reviewed release; do not patch an arbitrary “known” limit.

## Running and retaining automated evidence

From the repository root in PowerShell:

```powershell
npm run qa:check
# Use an existing explicitly disposable local rova_test_* database only.
$env:TEST_DATABASE_URL = 'postgres://<local-user>:<local-password>@127.0.0.1:54329/rova_test_qa'
$env:ROVA_QA_ALLOW_LOCAL_FIXTURES = 'true'
npm run qa:run
```

The runner executes sequentially to reduce resource-related test flakes: QA integrity
tests, all-workspace TypeScript, mobile lint/tests, API unit/contract checks, real
PostGIS integration, real admin browser workflow, API/admin build, Android JS export,
then the runtime probe. It writes a log+SHA256 for each and `automated.json` under a
timestamped `qa/evidence/` directory. That directory is excluded from Git/EAS uploads.
Tests with absent disposable DB permission/config are **not_run**, not passed. API
unit runs intentionally skip the DB suite, which has its own required integration job.
The browser fixture resets its separate fixed local `rova_test_admin_e2e_20261109`
database. PostGIS tests reset the supplied disposable database's public schema.
Never pass a production/application database URL or run the fixture on shared data.

The API must already be running for the probe. `ROVA_QA_BASE_URL` can target an approved
HTTPS deployment origin without credentials/query parameters; the default is localhost.
Automated providers/transports use test doubles; no real FCM message is sent. A browser
run may create its own isolated servers on3002/4101; normal admin3010/API4000 remain
separate. A job timeout fails; inspect/stop only that run's identified fixture processes
before retrying. Logs may contain test fixtures; review/redact before sharing them.

After genuine field/security/operations work, copy/complete `field-template.json` as
`field.json` in that evidence directory. Artifacts use paths relative to the automated
report directory and must stay inside it. Copy the exact tested APK there and hash it
without exposing keys. Record `buildProfile=preview` or `production`; a development
client cannot satisfy standalone production acceptance. Fill each case's tester,
independent reviewer, time, device IDs, observations, measurements and artifact hashes.
List unresolved defects with severity/status; keep all failures and retests.

```powershell
npm run qa:release -- qa/evidence/<run>/automated.json qa/evidence/<run>/field.json
```

This deliberately returns nonzero/NO_GO for missing, incomplete, failed, stale,
wrong-build or changed-source evidence, development builds, unresolved critical/high
defects, missing real devices, unsigned manual results, absent monitoring or pending
human localization review. Automated evidence expires after7days; individual manual
results after30days, and any relevant code/data/provider/config change requires a
review/retest even sooner. The checker does not certify hardware performance,
authenticity of a recording, legal compliance or source correctness: it checks
structural evidence integrity and leaves the final decision with accountable owners.

Store road videos/raw diagnostics encrypted with restricted access and tester consent.
Prefer redacted clips/derived observations; remove faces, plates, personal travel
history, API tokens, contacts and notification credentials from shared reports. Keep
any needed raw reference traces only in an explicitly consented QA environment with
an approved retention schedule, never the default product database. File access and
deletion must be audited. Do not upload APK signing material, `.env` or service keys.

## Defect and signoff record

Use: defect ID; requirement/manual/gate IDs; exact candidate/build/data versions;
environment/device/radio; safe reproduction; expected/actual behaviour; severity;
privacy-safe artifact/hash; owner; fix revision; retest evidence; reviewer; status.
Critical includes false known legal limits, confirmed-looking unverified enforcement,
unsafe guidance, security/data exposure and sustained distracting bogus warnings.
High includes reproducible navigation crashes, inaccessible end controls, failed
deletion or broken recovery. Never silently discard a flaky safety failure.

Signoffs must reference an artifact recording scope, limitations, date and decision
for safety, security/privacy, operations and product. “Evidence complete” from a
script is not automatic approval to publish. No field tester/reviewer identities or
manual results have been invented in this package.
