# Accra voluntary pilot — preparation, not a launch

Decision on 12 November 2026: **NO GO for participant road testing.** Read [READINESS.md](READINESS.md), then work through [LAUNCH.md](LAUNCH.md). No participants have been recruited, no real corridor enabled and no road test is claimed.

Proposed cohort: 12 consenting adults, six drivers and six passenger observers, paired for supervised sessions. This is a planning target, not evidence of enrolment. Start with diverse Android devices/network plans and include accessibility needs; participation and optional diagnostics must never be conditions of access to free basic navigation. Confirm any reimbursement, controller identity and support contact before recruitment; none is promised here.

## Participant disclosure and consent script (draft for human/legal review)

ROVA is experimental. Position, routing, voice, ETA, incident and speed-limit information can be wrong, delayed or unavailable. Road signs, traffic rules and safe judgment take priority. Unknown limits stay unknown. Unverified community reports are not authority-confirmed hazards or enforcement locations. ROVA does not promise camera coverage, reliable lane guidance, live Ghana traffic measurements or complete offline navigation. Never drive faster, brake suddenly or change lanes to trigger a test.

Use a securely mounted phone. The driver must not type, read forms, capture screenshots, alter settings or submit reports while moving. A passenger operates the test phone; a lone driver may interact only after parking legally and safely. If guidance is confusing, continue safely and stop at a suitable place to investigate. The app is not an emergency service. Do not test deliberate dangerous manoeuvres, excessive speed, prohibited roads or unsafe weather/flood conditions.

Participation is voluntary. The coordinator explains the session, risks, planned corridor, duration, safe stopping places, support contact and withdrawal process first. Collect separate agreement to participate and separate optional diagnostic consent. Keep signed/contact/coordination records outside product analytics with approved access and retention; do not invent consent or record a person's route in the beta roster. They can stop a session or withdraw without losing guest navigation. No location-history recording is requested.

The in-app diagnostic switch starts OFF. If enabled, ROVA sends bounded **daily counters** and native app version/build/variant to its own API: instrumented sessions, observed crashes/ANRs on supported Android builds, JS fatal counts, navigation attempts/failures/arrivals/cancellations/reroute failures, GPS quality and verified/unknown speed-limit lookup samples. No coordinates, routes, searches, notes, stack/error text, email, account ID or advertising ID enter this payload. A random temporary credential links batches for retry and deletion; it is pseudonymous, not a guarantee of anonymity. The network service receives an IP address in transit; infrastructure logging must be reviewed before enabling collection. Normal navigation/search providers still process requests as disclosed separately.

Queued counters are encrypted using the existing device-only key storage. Only the last seven days are eligible for transmission; stale queues are removed at the next active flush (a closed/uninstalled app cannot run cleanup). Server counters have a 30-day scheduled cleanup window; the production scheduler must be proven before collection. Hash-only consent leases expire after seven days and are purged by the daily job after expiry plus 30 days (up to approximately 38 days after creation, assuming the scheduler runs). Withdrawal disables collection, erases local counters and requests deletion of server contributions; offline erasure retains an encrypted deletion credential and retries when the app runs online. Reinstalling/clearing OS app data can destroy that credential, leaving server retention as the fallback. No data is sent to a third-party analytics SDK by this implementation.

## Safe session protocol

1. **Before departure, parked:** verify the exact APK/build hash, permissions, mount, battery, accessibility settings, voice volume/mute and approved corridor sheet. Explain disclosures and obtain agreements. Choose diagnostics separately; a decline is valid. Use synthetic fixtures only on the bench, never presented as real road facts.
2. **Passenger observation:** follow the independently checked corridor legally, using normal driving. The observer notes issue category, app build and expected/observed behaviour without recording continuous movements or exact home/work endpoints. Never ask the driver to provoke overspeeding, GPS loss or sudden braking.
3. **Connectivity/GPS:** airplane mode, permission revocation, simulated drift, wrong-direction/reversed geometry, provider failure and expiry tests happen on the bench or parked. Any road comparison uses independent parked evidence and passenger observations; simulation is not road acceptance.
4. **Stop rule:** serious wrong instruction, false verified limit, sustained bogus warning, driver distraction, unsafe voice overlap or participant discomfort ends the test safely. Follow the rollback workflow. Never troubleshoot in moving traffic.
5. **After parking:** submit the structured feedback record, confirm no sensitive route/screenshots were attached, review unknown-limit handling and battery/network use. Offer withdrawal and demonstrate queued deletion. Record device/manual evidence honestly against the existing [QA matrix](../qa/matrix.json).

## Telemetry interpretation

| Measure | Denominator / limitation |
|---|---|
| Android observed crashes | Java + native process crash exits / supported instrumented sessions, on Android 11+ after a later restart. Missing old APK/native module, history truncation or build changes produce unsupported/gap evidence, not a zero-crash claim. ANRs and JS fatal observations are separate counters; do not add them as distinct people or crashes. This is not a validated crash-free-session product metric. |
| Navigation failures | First terminal failure / attempt; arrival/cancellation counted once per attempt. Failures after an earlier terminal outcome do not create another attempt. Cold startup failures before JS/consent restoration cannot be observed here. |
| GPS quality | Good / (good + poor + stale) samples; at most once per 30 seconds. No sampled position is sent. No updates may mean missing observation, not good GPS. |
| Verified/unknown coverage | Verified / (verified + unknown) sampled online compliance lookups, at most once per 30 seconds. Failed network requests count unknown. This is **not road kilometres, Ghana coverage or the percent of roads verified**. Low-data/offline exposure is not fully represented. |
| Freshness | Published rule candidate counts with stale review/missing expiry; corridor eligibility separately checks current provenance, reviews and validity. These counts do not prove a sign remains legally correct. |
| Incident precision | Latest timely report revision with at least two independent agreeing evidence checks: confirmed / (confirmed + false). Uncertain/conflicting/unassessed reports are separate; moderation acceptance and community votes are not ground truth. No rate before 20 assessed reports. Sampling/reviewer bias still applies. |
| Provider costs | Existing persistent reservation/request ledger and pricing worksheet. Not actual invoices; direct mobile map SDK usage and invoice reconciliation remain separate. |

Admin diagnostics suppress build groups below five temporary leases or 20 instrumented sessions; leases are not unique participants. Small-sample suppression is not a differential-privacy or anti-reidentification guarantee. Never use these exploratory percentages as a launch pass by themselves. Compare consented builds consistently and record missing observations.

See [API.md](API.md) for contracts, retention, rollout switches and implementation limits.
