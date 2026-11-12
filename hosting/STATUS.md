# Hosted backend status — 2026-11-12

Production API: https://rova-api-amber.vercel.app

Vercel project `rova-api` in the approved `girliehood` account runs the API independently of the developer computer. Supabase project `qmdbvjuezizdfjepgwag` provides PostgreSQL/PostGIS and Auth. Production deployment `dpl_9GjL22m9q3Avya6AgnwjJPpwRkfp` uses reviewed commit `b45f08563ca20b1c46cb6fa9acaa1e9bcfe8cf4d`.

All 15 migrations are applied. Transferred review data contains 23,019 map candidates, 44 unverified reported-road advisories and 834 associations. No synthetic or verified speed rules were copied. Hosting does not verify these records.

Public production checks passed: health/readiness, enabled Auth configuration, destination search (six real provider features), routing (two alternatives), unknown speed-limit response, unauthorized administrator denial, administrator password login/session/logout, and protected maintenance execution. Direct anonymous Supabase reads of road segments, speed rules and audit logs returned 401. No email or push notification was sent.

Maintenance completed manually; the first scheduled invocation has not yet been observed. Pilot telemetry and remote push remain disabled. Corridor safety gating remains enabled. Optional driver email-code delivery/template and actual-device cold starts, navigation and reconnect behavior are not verified by these server checks.

Local mobile/admin configuration and EAS base public endpoint defaults point to this production origin. Existing installed APKs retain their previous bundled endpoints until rebuilt or appropriately updated. No APK/AAB was built and no Play Store submission was made in this hosting task. The administrator initial password is stored only in ignored `apps/api/.env.admin-bootstrap.local`; change it after initial access.

The pilot remains **NO-GO** pending the existing road, device, legal and operations acceptance requirements. Free-tier limits and backup/uptime limitations in [README](README.md) still apply. Admin website hosting is a separate task.
