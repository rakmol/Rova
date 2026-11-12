# Language, accessibility and driver interaction

This is preview implementation, not a claim of completed human translation review, TalkBack certification, low-end hardware testing or dependable real-road navigation.

## English first; reviewed Twi/Ga later

`src/i18n/en.json` centralizes navigation controls, large alerts, vehicle/hazard labels and all app-generated spoken navigation/compliance/community cues. `tx` interpolates named values and rejects missing parameters. Provider maneuvers are requested in English (`lang=en`); place/street names are kept as returned, not machine-translated or invented. Existing account, networking and general help messages remain English; these also need full screen-by-screen review before introducing another app language.

`src/i18n/reviews.json` records catalogue revision, translation completeness, reviewer/date and pronunciation reviewer/date. All reviewer fields are deliberately empty. English is allowed in development preview; Twi (`tw-GH`) and Ga (`gaa-GH`) are not selectable and fall back to English. There are no guessed translations or unsupported claims that device Twi/Ga speech is available.

To add a language later: obtain a complete human translation with matching interpolation fields, add its typed catalogue, perform screen/voice/road-name pronunciation review, record genuine reviewers/dates for the current revision, then register/enable the catalogue. Increase `catalogRevision` whenever reviewed copy changes. Verify installed device voices separately; UI translation does not establish speech-engine support. Do not speak Twi/Ga text with an English voice as a substitute for validated localization.

`npm run localization:check` is the production release gate. `eas-build-pre-install` allows the `development` build profile and blocks other profiles until enabled catalogues are complete and human copy/pronunciation reviews match the current revision. English currently fails this release gate intentionally. Never fabricate reviewer identities or approvals to make a build pass. Development preview is not approval to publish to an app store.

## Readable and accessible navigation

- Upcoming instructions are 28 sp, without a line clamp. Turn distance is 20 sp; verified limits and sustained-overspeed warnings use 24 sp text. Supporting status is 14–16 sp. Font scaling remains enabled.
- At 130% font scaling or with a long maneuver, navigation becomes scrollable with the primary mute/end/retry controls above the map. Metrics use two columns. This avoids relying on fixed tiny labels or text shrinking. The map and text guidance remain separate so unavailable tiles do not hide the maneuver.
- Navigation has no form, advertising, sponsored placement or promotional overlay. Required provider attribution remains visible. Nonessential diagnostic details are reduced while moving; actionable community hazards remain distinct from official limits.
- Warning panels include explicit words and `!`, not color alone. Unverified data retains its text label. Heading/alert roles and meaningful button/metric labels support screen readers. Time/distance/speed changes are not all live-announced every second; only meaningful instruction/alert text uses polite live regions.
- Primary buttons are at least 56 sp high and 48 sp wide, map zoom targets are 48×48, and tab heights account for safe areas and font scaling. Day/night text palettes and control boundaries have automated contrast checks. These checks cover defined colors, not every physical rendering condition or glare scenario.

React Native [accessibility](https://reactnative.dev/docs/accessibility) and [text scaling](https://reactnative.dev/docs/text) APIs are used. Palette checks use the [W3C minimum contrast calculation](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for the tested normal text combinations and 3:1 for tested control boundaries. This is not a blanket claim of WCAG conformance for the complete app.

## Forms and movement

The shared `Page` shell wraps search, reporting, saved places, sign-in and settings in `DrivingGate`. A fresh speed of at least 1.5 m/s with accuracy at most 25 m defers forms and dismisses the keyboard. It does not stop navigation or lower GPS matching thresholds. Uncertain, stale, repeated or future-dated fixes cannot release an existing movement lock. Release needs stationary readings at most 0.4 m/s spanning eight seconds, with no gap over five seconds. A stationary fix is not proof that a car is parked; drivers must still park safely before interaction.

An explicit passenger acknowledgement allows interaction for five minutes, resets in the background and is not saved. It is a self-declared passenger mode, not an authenticated driver identity or permission for a driver to interact while moving. Incident submission retains its independent fresh-location/parked/passenger checks.

Movement checks use existing navigation GPS updates. Outside navigation, a single balanced, foreground-only three-second watch starts only if location permission is already granted; this feature never presents an unsolicited permission request. It stops in the background and yields to the navigation watch. Only speed/accuracy/timestamps are held in memory; no journey history is saved or uploaded by the guard. Without permission or a usable speed reading outside navigation, movement cannot be inferred: safety copy and the parked/passenger reporting requirements remain important. Do not describe this as guaranteed detection of driving.

## Speech priority and bounded work

`VoiceCoordinator` permits one app cue at a time: arrival, maneuver, verified safety, then community advisory. A new maneuver can replace an older maneuver or interrupt a lower-priority cue. Lower-priority warnings wait without interrupting a maneuver, and expire after three seconds instead of playing after the relevant road event. Stop/mute clears pending cues; late completion callbacks cannot revive them. Only the latest navigation session owns native speech.

There is at most one queued cue per kind and 256 deduplication entries. A 30-second watchdog stops a stalled speech operation. Native stop failures do not start another overlapping cue. Existing maneuver/overspeed/geofence cooldowns, validity checks and audio opt-outs remain. The app cannot guarantee scheduling against phone calls, OS accessibility speech, other apps or a faulty TTS engine; physical audio-focus/TalkBack tests are required. See [Expo Speech SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/speech/).

## Automated checks and required device QA

Automated tests cover priority/preemption, duplicate and expired cues, stale callbacks, mute/stop, cross-session speech ownership, watchdog recovery, a 10,000-cue bounded-memory burst, movement/noisy GPS/stale gaps, passenger expiry, permission/background/watch lifecycle, form visibility, 360×640 with 200% font settings, color-independent alert text, primary control order/target sizes and palette contrast. The small-screen checks assert component semantics/layout settings; they are not pixel-level validation on an actual phone.

No physical low-end Android device or Android debug tooling is accessible in this workspace. Hardware testing remains **pending**. Before release, record device/model, Android version, RAM, build ID, tester/date and results for at least:

1. A supported Android device with approximately 2 GB RAM and a small screen; normal and 200% font size, day/night mode and high display scaling. Check all navigation states, long real Ghana street names, overspeed, stale GPS, lost network and arrival. Verify no controls overlap system navigation or disappear below inaccessible content.
2. TalkBack traversal of map controls, destination search, settings, reporting, alerts and navigation. Check focus order, full labels, disabled-state announcements, keyboard dismissal and that GPS ticks do not cause constant chatter. Test actual OS speech and app voice together.
3. Parked/passenger simulation first: confirm forms disappear on movement, cannot be unlocked by noisy/stale GPS, resume only after stationary hysteresis, passenger mode expires and backgrounding clears it. Never ask the driver to type while testing on a public road.
4. English TTS installed and unavailable/offline, low volume, mute, phone call/audio interruptions, long maneuvers and simultaneous safety/community events. Confirm maneuver priority and no stale replay after returning to foreground.
5. A 30-minute foreground navigation run in battery saver with intermittent Ghana mobile data; record frame stalls, memory/battery use and GPS accuracy. The bounded queue test is not a measured FPS, battery or speech-latency result on low-end hardware.
6. Human copy and pronunciation review across all screens before adding an approval to the release manifest. Validate Twi/Ga on their actual intended devices/voices before enabling either language.
