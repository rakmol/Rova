# Prioritized launch and operations plan

All entries below are **pending unless separately evidenced**. Owner names are roles to assign, not claims of staffing.

## P0 — block any public road beta

- **Owner / privacy reviewer:** review the participant disclosures, controller/contact details, Ghana privacy obligations, processing/hosting arrangements, consent and retention. Publish approved privacy/terms and reachable external deletion/support pages; existing working drafts do not count.
- **Data lead + two independent reviewers:** obtain current road/sign/authority evidence for a small Accra corridor; verify start/end geometry, direction, class, accuracy, validity, source licence and applicability. Publish each road and rule through the existing independent review workflow. A map speed tag or reported enforcement area is not independent legal verification.
- **Administrator:** create a corridor draft with published segment IDs and evidence reference. Two non-author reviewers approve its current revision within seven days. Activate only after all human gates below pass; no segment/limit/camera seeds are provided as real data.
- **Release/device lead:** compile the native diagnostic bridge in a new APK; test on supported Android 11+ and an unsupported/missing-module build. Confirm missing evidence is labelled unavailable, no startup native-module crash occurs and the final signed APK matches the tested commit. Autolinking/JS export alone do not verify Kotlin compilation or hardware behaviour.
- **QA lead:** execute and attach real device/passenger evidence from [QA](../qa/STRATEGY.md), including map readiness/puck/keyboard/safe-area regressions, parallel-road/GPS ambiguity, voice priority, unknown limits, false overspeed, low-end Android, permissions, network switching/offline, deletion and battery/data consumption. No fabricated field sign-off.
- **Operations owner:** deploy permanent HTTPS API/PostGIS/admin services, apply migration014, prove backups/restore and daily maintenance scheduling, set production corridor gate true, establish on-call support and monitoring. Localhost/tunnels and CI fixtures are not launch hosting.
- **Privacy/operations owner:** inspect ingress/proxy/app logs and SDK traffic for IP/location/credential retention. Keep `PILOT_TELEMETRY_ENABLED=false` until the approved disclosure and retention/deletion jobs are operational. The participant must still separately opt in.
- **Provider owner:** confirm map/routing/geocoding intended-use rights, attribution, offline/caching permissions, account quotas and actual costs. Reconcile SDK/provider dashboard usage; no unconfirmed Ghana traffic layer.

## P1 — staged enablement with signed evidence

| Stage | Scope | Gate to next stage / rollback trigger |
|---|---|---|
| 0 — internal bench | Test fixtures/disposable DB only. No voluntary road cohort yet. | All automated contracts pass; installed APK tested, native/JS evidence identified; privacy/hosting/support/data P0 complete. |
| 1 — passenger pilot | Two pairs initially, one independently verified corridor. Stage `passenger`, expiry at most 30 days; seven-day review freshness. Core navigation remains free and guest capable. | At least 10 safely completed passenger-assisted journeys across two devices/network conditions, every unknown limit stays unknown, no unverified enforcement represented confirmed, no sustained bogus warnings, no dangerous guidance/voice overlap, deletion/recovery verified. This is a minimum operational sample, not statistical proof. Human safety lead reviews every significant incident. |
| 2 — limited voluntary cohort | Up to the proposed 12 adults, same approved corridor(s); create/review a fresh revision for stage `limited`. | At least 30 documented safe sessions, representative device/network evidence and actual battery/data/cost measurements, no unresolved critical/high safety issue, incident precision sampling reviewed independently. Telemetry can be declined and cannot be the only evidence. |
| 3 — additional corridor | One corridor at a time with its own evidence and independent reviews. | Repeat corridor/device acceptance; never inherit legal limits from another road or use a city-wide default. Broader/store release requires the separate release gates. |

These are proposed human go/no-go gates. The dashboard deliberately does not auto-certify a launch from small telemetry samples. Corridor stage is operational metadata, **not participant access control**; there is no private cohort invitation/access system yet. Only distribute beta access to the agreed volunteers, with an appropriate distribution control before wider exposure.

## P1 — support and feedback workflow

Assign a reachable support inbox/form and a staffed coordinator before invitations. **No live support address or outbound alert delivery is configured by this work.** Do not place a fictitious contact in the app. Until staffed, collect internal bench issues in the repository without private data; do not ask volunteers to post personal information publicly.

Use a case ID and this minimal record: category (crash/navigation/GPS/voice/limit/incident/privacy/cost), build/version/device/Android version, safe-test mode (parked/passenger), approximate day, expected vs observed behaviour, impact/severity and reproducibility. Corridor ID can be added with permission. Exclude raw routes, current-trip coordinates, home/work addresses, tokens, emails and unredacted screenshots. Exact sign evidence belongs in the restricted provenance workflow with consent/authority and access controls, not analytics. A location needed for a safety investigation must be explicitly volunteered and minimised; never silently attach location history.

Triage targets to staff and test: **critical** false known limit, dangerous instruction, sustained bogus alert or privacy leak → stop the affected beta safely, page the safety/operations owner, pause affected corridor immediately and preserve a sanitised case; **high** repeat navigation/crash/permission failure → block that build/corridor pending investigation; **medium/low** readability/performance/general feedback → review daily, prioritise, link fix/test/build, communicate resolution. These targets have not been staffed or exercised; do not advertise a response-time guarantee.

Independent observers verify a report only while parked or from reliable documented evidence. Reviewers record `confirmed`, `false` or `uncertain` against the current unexpired revision. Two agreeing independent reviews are required for the precision denominator; disagreements need investigation and never silently become confirmed.

## P0/P1 — rollback runbook

1. Coordinator tells affected testers to stop using the affected feature when safely parked; do not issue urgent instructions that could cause sudden braking. An emergency is handled by appropriate local emergency services, not this support workflow.
2. Admin opens **Accra pilot quality → Pause corridor** with case/comment. The audited API also supports `POST /v1/ops/pilot/control` with `{id, revision, action:"pause", comment}`. Pause all affected corridors; do not amend evidence to force a pass. Editing a corridor resets its reviews and status to draft.
3. If scope is uncertain, operations leaves `PILOT_REGION_GATING_ENABLED=true`, pauses all corridors, and may disable `COMPLIANCE_ALERTS_ENABLED`, transition/corridor/report flags and/or `PILOT_TELEMETRY_ENABLED` in service configuration then restart/redeploy the API. Do not disable the gate as a workaround. Remote diagnostic erasure remains available with collection disabled.
4. Online safety contexts last at most three seconds, but in-flight requests/poll intervals/network loss mean shutdown is **not instantaneous**. Preview/release pilot builds set `EXPO_PUBLIC_PILOT_MODE=true`: no numeric offline safety lookup/pack export, including old cached packs. Old already-installed APKs do not gain this control automatically; halt their beta use and distribute a tested compatible build. Map/route instructions may remain visible; a warning's absence is not proof of safety.
5. Halt further APK distribution/rollout and preserve exact commit/build/incident evidence securely. Do not deploy a lower Android versionCode; issue a tested higher-code fix or use a compatible tested update mechanism. No Play rollout or paid EAS build is triggered here.
6. Investigate source/GPS/provider/code causes; test the fix and rollback on bench/device, obtain fresh independent source/corridor reviews where needed, update the case and acceptance evidence. Re-enable one corridor/build only after human safety/operations approval. Document affected dates, missing telemetry and corrective communication.

## P2 — monitoring cadence

During staffed sessions: inspect crashes/navigation failures/GPS availability plus qualitative observer cases. Daily: review unknown-lookups, provider request/cost budgets, stale rules, corridor expiry/review age, pending erasures/retention, incident disagreements and support backlog. Weekly: independent evidence refresh and cohort/device representativeness review. Alert delivery/paging is still manual; the admin page is refreshed on demand, not an installed monitoring agent. Assign escalation owners and exercise rollback before inviting participants.
