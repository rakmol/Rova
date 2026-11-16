# Lapaz–Madina reported speed advisory

Owner-authorized on 16 November 2026: display **Reported limit: 80 km/h** in
navigation, alongside **Not independently verified. Follow posted signs.**
This is a reported advisory, not an authority-verified legal speed rule, a
recommended driving speed, a camera location or an overspeed alert threshold.

The owner extended the report from Lapaz on N1 via Tetteh Quarshie and Legon
to Madina. The N1 news/photo source supports an 80 sign at an unspecified
location; it does not prove that the restriction extends to Madina:
https://www.pulse.com.gh/story/ghana-police-install-traffitech-gh-warning-signs-2026111410264999272

## Scope and provenance

`apps/api/src/reported-speed-data.ts` contains 76 clipped OSM main-carriageway
pieces from the existing mapping-candidate store. OSM way IDs/versions and
attribution are retained. Geometry is mapping evidence only, never evidence
of a legal speed limit. Source: © OpenStreetMap contributors, ODbL,
https://www.openstreetmap.org/copyright . No route-provider geometry is cached.

The geographic cutoffs approximate the proposed locality endpoints, not
regulatory sign boundaries: N1 between longitude -0.24869 (Lapaz locality)
and -0.1768524 (Tetteh Quarshie); N4/J.J. Rawlings Avenue between latitude
5.6204073 (Tetteh Quarshie) and 5.6789954 (Madina Market latitude).
Service streets, ramps and connecting side streets are excluded. There can be
gaps at short pieces/interchanges; this is not blanket regional coverage.

The report expires on **16 December 2026**. Before extending it, check the
actual signed sections, directions and lower posted restrictions. Edit/remove
the versioned report and deploy the API to update/withdraw it. Do not invent
authority approval, independent review or exact camera positions.

## Runtime behavior and delivery

The existing `/safety/alert-context` endpoint has an optional
`reportedSpeedLimit` field. Old clients ignore it. New clients show it only
when actively navigating with fresh precise GPS, aligned selected-route
traversal and an exact nearby mapped piece. Both travel directions are
included as a **report**, not a claim of confirmed signed applicability.
No report is returned when the reported-road feature is disabled.
Verified pilot publication gates remain unchanged; an owner report does not
activate a verified safety corridor. Missing/expired/offline/out-of-corridor reports hide.
Any verified applicable speed limit takes precedence. The report is never
passed to verified overspeed or transition speech; approved contribution and
existing enforcement-awareness speech are unchanged. No safety DB approvals
or production road rules are created.

The initial display requires a new APK because previous clients have no UI
for the new field. Subsequent report changes reach that client through the
API without reinstalling. Automated matcher, API, client and UI checks cover
separation, bounds, expiry, GPS problems and lower verified limits. Actual
Accra road tests and field confirmation have **not** been executed.
