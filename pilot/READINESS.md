# Accra pilot readiness — 12 November 2026

**Decision: NO GO for a voluntary road beta or public launch.** Preparation is implemented; no pilot is claimed to have started. This report is deliberately separate from passing automated tests.

Local read-only development DB snapshot at **2026-11-12 02:38 UTC**, after migration014:

| Evidence | Observed |
|---|---|
| Published non-synthetic road segments | 0 |
| Published speed-limit rules | 0 |
| Published enforcement zones | 0 |
| Configured / currently eligible pilot corridors | 0 / 0 |
| Diagnostic contribution batches | 0 |
| Independent incident evidence checks | 0 |
| Collector flag / development corridor gate | false / false |

This is a **local** snapshot, not a claim about a production database. Production configuration defaults to corridor gating; no production rollout/flag change was performed. Reported/unverified areas and OSM candidates are not counted as verified roads, limits or cameras. A Ghana-wide80km/h default was not introduced.

Implemented: separate encrypted optional diagnostics, bounded daily counters without route/location-history analytics, receipt deduplication and consent/deletion race handling, supported-Android exit-history bridge source, suppressed quality dashboard, source freshness/provider reservation visibility, independent incident assessment workflow, reviewed corridor activation/pause/expiry and audited revision controls, plus the safe voluntary protocol, support and rollback plan.

Automated evidence is recorded when commands are completed in this change. Tests exercise disposable fixtures and do **not** verify real Ghana signs/corridors, native Kotlin compilation, actual APK permission/network behaviour, crash capture reliability, background delivery, safe on-road instructions or battery consumption. Native rebuild/device tests and real passenger-assisted QA remain unexecuted. No measured crash/navigation/precision/verified-coverage baseline exists with zero contributions/assessments.

Blocking evidence still needed, in priority order:

1. Independently verified legal/sign/source evidence and exact road geometry for at least one corridor; two distinct qualified current reviewers and human safety approval. None is available in the observed database.
2. Permanent production API/PostGIS/admin hosting, log/SDK inspection, secure operations, backup recovery, verified retention scheduler, staffed support and a rollback exercise. Local services/tunnels/CI are not evidence of production operation.
3. Approved participant disclosures and Ghana privacy/legal/provider-rights review, controller/support identity and published privacy/deletion/terms pages. No counsel sign-off or official TraffiTech representation approval is claimed.
4. A compiled signed APK containing the new native module, real low-end Android/device/network tests and safely performed passenger/parked evidence against the traceable QA matrix. A newer APK is required for native crash counters; no APK was built/distributed by this task.
5. Invited adult volunteers with recorded separate participation and optional telemetry consent; suitable beta distribution/access controls, named coordinator, issue triage and follow-up. No invitations or user messages were sent.
6. Actual provider invoice/SDK-cost reconciliation and independent incident assessment sampling. Current dashboard supports inspection but does not supply missing data or automatic paging.

Readiness can change only with dated evidence, responsible reviewer sign-off, exact build identification and resolution of critical/high issues. Do not turn this report into GO by replacing unknown results with zero or by loading synthetic records into production.
