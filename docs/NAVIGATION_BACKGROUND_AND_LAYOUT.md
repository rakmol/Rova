# Navigation layout and Android app switching

The navigation engine now belongs to the root ActiveNavigationProvider, not
the map screen. Leaving the screen or pressing Home does not mean End.
Compact maneuver text uses up to three lines with the full accessible label
and full spoken instruction. Journey metrics use a single compact row;
additional reports, attribution, network and audio settings expand on demand.
Mute and End stay outside scrolling content. Large-text accessibility keeps
the full scrolling alternative with persistent controls.

## Background guidance

SDK 58 Expo TaskManager registers a global location task. With explicit OS
background location permission, active navigation starts Android's location
foreground service with an ongoing notification. GPS, progress, maneuver
speech and eligible safety processing continue while other apps are open.
The service starts only for navigation and stops on End, arrival or manual
pause. Background permission is requested only from the explanation under
Settings → Navigation & voice → Navigation outside ROVA. It is not silently
granted. Revoking it falls back to foreground guidance without discarding
the destination. Notification visibility also depends on Android permissions.

No draw-over-other-apps permission or floating overlay is enabled. A foreground
service provides background navigation without covering another application.
This requires a **full native APK**, not a JavaScript-only repack or Expo Go.

Android force-stop and some vendor battery policies can terminate a service.
Do not promise uninterrupted guidance after an explicit force-stop. A headless
location task with no live navigation consumer stops after a short grace
period rather than tracking indefinitely. On relaunch, an encrypted checkpoint
can recover the active destination for up to six hours by fetching a fresh
route from current GPS. It contains destination, display title, vehicle type
and expiry only: no raw route, prior GPS fix or continuous travel history.
It clears on End, arrival, expiry or phone-data erasure. Restart recovery needs
network and a fresh GPS fix; failure keeps a retry/end choice, not a fake route.

## Reported speed display stability

OSM way endpoints are not legal or advisory boundaries. Adjacent same-road
pieces are joined only at identical endpoints and compatible headings;
parallel streets, crossings and real gaps remain separate. New clients request
reportedSpeedSchema 2: a **display-only reported advisory** can remain usable
for at most 15 seconds across a refresh failure while every fresh GPS fix is
still checked against its mapped geometry. Explicit null/withdrawal, route
change, leaving the road, poor GPS, offline mode, report expiry and stopping
navigation clear it. Older APKs retain their original three-second response
contract. Verified limits, numeric alerts and legal proof lifetimes are not
extended by this display cache.

## Validation and remaining field acceptance

Automated checks cover screen-unmount ownership, Home/background progress,
foreground-only fallback, manual pause/end, cold destination recovery,
checkpoint erasure/expiry, compact/full instructions, joined geometry,
parallel-road exclusion and reported/verified separation. Real road tests,
voice accuracy on Accra roads, extended battery tests and force-stop behavior
on additional Android vendors still require safely parked/passenger-assisted
device acceptance; do not claim those tests have been performed.
