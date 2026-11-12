# Play privacy / Data safety working sheet

**DRAFT. Not a submitted form, privacy policy or legal approval.** Owner/controller identity, privacy contact and real HTTPS privacy/deletion URLs must be supplied and reviewed before launch. Keep the existing Ghana/provider-rights/security acceptance blockers open. Do not answer “no data collected” merely because sign-in is optional or some data stays on the phone.

| App behaviour to inspect in the exact AAB | Candidate disclosure / required verification |
|---|---|
| Optional first-party pilot daily counters, native crash/ANR observations, build/version and temporary deletion credential | App info/performance/diagnostics and pseudonymous identifiers may require disclosure. Default off; separate consent. No route/location histories in these counters. Verify the final APK, IP/infrastructure logs, retention scheduler and opt-out/deletion; see [pilot disclosure](../pilot/README.md). Existing third-party SDK processing remains separate. |
| Foreground GPS, routing/search coordinates and destination queries | Precise location and provider processing: review the actual network flow, ephemeral-processing/service-provider definitions, retention and purposes |
| Anonymous incidents, approximate coordinates, optional notes and votes | Approximate location, user-provided content and anonymous installation/device identifiers; inspect spam-control retention and what is public |
| Optional Supabase email sign-in, account ID and explicit saved-place backup | Personal info/user IDs and optional saved places; confirm real provider regions, processor terms, deletion and queue handling |
| Encrypted phone Home/Work/history/offline routes/reminders | Distinguish on-device storage from transmitted data; test opt-in/clear/erase and backups; no continuous trip-history persistence by default |
| Mapbox, MapLibre tile provider and other SDK/network requests | Inventory actual identifiers, diagnostics and telemetry/opt-out from the final APK; source declarations alone are insufficient |
| Optional Expo/FCM tokens and coarse saved notification regions | Pending Firebase configuration; local reminders differ from remote push. Revisit disclosure before enabling remote delivery |
| Sponsored listings/advertiser analytics | Disabled. No navigation ads or marketing collection were enabled. Reassess Play “contains ads” and consent before any future activation |

For each applicable data type document purpose, required/optional collection, sharing classification, encryption in transit, retention and deletion controls. Have counsel/qualified reviewers validate answers against current Google definitions and Ghana obligations. Do not infer provider telemetry status from default library settings. No Google advertising ID or background location permission should be added just to satisfy this checklist; inspect the final merged manifest and remove unneeded SDK permissions through supported configuration after review.

Before submission:

- Publish reviewed, accessible privacy and Terms pages identifying the actual controller, processors, transfers, retention, rights/contact and deletion process. These drafts do not satisfy that requirement.
- For optional in-app account creation, implement/verify the in-app deletion path and a publicly reachable external account/data-deletion request URL. Verify server/provider failure, identity validation and actual completion. Anonymous public safety/audit retention needs honest explanation and legal review.
- Complete Play App content: app access/reviewer instructions (guest core navigation works), target audience/content rating, ads declaration, Data safety and permission justifications. Give the reviewer a reachable production-like backend; do not expose admin or server keys.
- Check final manifest permissions/network traffic on device, Play pre-launch reports, minimum/target SDK and native-library/16KB-page support requirements shown by the current Play Console. No compatibility result is claimed by this sheet.
- Prepare actual512px Play icon, feature graphic and real phone screenshots from the reviewed app. Review English copy and voice pronunciation; Twi/Ga remain future human-reviewed work.

Sources: [Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469), [account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111). Definitions/account-specific requirements must be rechecked at submission time.
