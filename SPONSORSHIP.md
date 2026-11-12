# ROVA sponsorship model — prelaunch design

ROVA's navigation, routing, safety information and spoken alerts remain free for every
driver. Sponsorship does not purchase road verification, preferential route selection,
an ETA change, safety coverage or emergency priority. Ads are **not enabled**.

## Driver-facing design for a future release

Eligible businesses: petrol stations, mechanics, tire shops, car washes and roadside
services. Listings use factual public business names, locations, contacts and opening
hours where documented. No fabricated endorsements, availability, rescue response
times or claims that a business is safer because it paid ROVA.

Every future sponsored result and pin must visibly say **Sponsored**, including its
screen-reader label. A pin uses a business icon with a Sponsored tag, distinct from
road hazard/authority symbols. The detail card explains that sponsorship is paid
placement, not a safety endorsement. Do not reuse verified-safety badges.

Example layout specification (illustrative placeholders, not actual listings):

    Sponsored local services · paid placements
    [Sponsored] [Business name] · Mechanic
    [Public address] · [Documented hours or “Hours unavailable”]
    View business · Why am I seeing this?

Show at most three paid entries in a separately labelled discovery section when the
user is stopped and explicitly browsing services. Organic results retain their own
ordering. Paid entries rotate fairly within eligible category/region; there is no
bid auction, safety priority or route-scoring input. A business's paid tier must never
move it into organic rankings. A route to a business is requested only after the driver
explicitly chooses it; route computation receives the destination, not a sponsor score.

No sponsored UI during any active navigation session, including paused, poor-GPS,
off-route, rerouting and arrived-until-ended states. No pop-ups, promotional overlays,
audio ads, interstitials, banner obstruction, notification advertising or forced ad
viewing. Driver forms remain deferred until safely stopped. No public map ad layer or
ad SDK has been implemented in this change.

## Proposed pricing, not a live offer

| Proposal | Per location / 30 days | Intended future placement |
| --- | ---: | --- |
| Basic business listing | GHS100 | Labelled sponsored business directory |
| Featured discovery | GHS250 | Eligible labelled discovery section/pin while browsing |

These are initial product proposals, not market benchmarks, approved prices or a
checkout offer. No charges, subscriptions, payment integration or campaigns run now.
Rates, taxes, cancellation/refund terms and the advertiser contract need owner approval
before launch. No per-click billing, guaranteed exposure, visits, calls, sales or
navigation priority. Do not accept payment while delivery is disabled. Any later
experiments must remain inside the labelled discovery area and driver-safety gates.

## Targeting and consent

Future targeting uses only an explicitly chosen town/suburb and service category.
No current GPS, saved Home/Work inference, current-trip coordinates, sensitive traits,
continuous location history, cross-app identifiers, retargeting or sale of driver data.
The driver's future optional sponsored-discovery preference starts off and must explain
placement, aggregate measurement and how to withdraw. Declining it never restricts
free navigation or safety. Requesting directions to a business does not create ad
profiling consent. Current builds collect no ad events or ad consent.

Any proposed precise-location targeting, continuous profiling, third-party ad SDK,
new measurement identifier or data sharing requires a separate applicable-law/privacy
review and a new explicit consent design before development or activation. No legal
review or compliance certification is claimed by this document.

## Admin review implemented now

Admin **Sponsored draft review** supports draft creation, current revision review,
independent approve/reject votes, before/after evidence, comments, expiry, withdrawal
and restoring an earlier revision as a fresh pending revision. Existing viewer,
reviewer, editor and administrator roles apply. The creator/revision author cannot
self-approve; stale reviews cannot approve edits. Reviewers check:

- Business identity, authority to advertise and evidence of control/permission.
- Correct business location/public address, category and public contact details.
- Truthful copy, documented claims and evidence reference; no misleading safety badges.
- Label **Sponsored**, dates, proposed plan, pricing disclosure and driver-safe placement.
- No sensitive targeting, harassment, discriminatory copy or unsupported emergency claims.

Both positive and negative reviews are retained. Two independent positive reviews
without rejection are the future readiness criterion, not permission to serve ads.
For launch, re-review current evidence; never auto-publish prelaunch drafts. Publication
is blocked in the API even for administrators and the database has **no publishable
state**. A configuration/environment toggle cannot unlock it. No public ad fetch,
tracking, billing, campaign activation or advertiser-sign-in endpoint exists.

Business geometry is a business point in WGS84; it is never a driver coordinate and
never enters road_segments, speed_limit_rules, enforcement_zones or their matching
queries. Tables are separate, RLS enabled without public policies, and public/driver
SQL privileges are revoked. Draft business data has the same admin audit trail as
other revisions; it is not published to drivers.

## Aggregate reporting foundation

Admin **Sponsorship plan & analytics** explains the disabled state, pricing proposal,
targeting, consent and launch gates. There is no advertiser portal yet; business owners
do not receive administrator credentials. A future portal must authenticate business
ownership and restrict every query to that business's listings before it can launch.

The prepared metrics table accepts only daily per-listing integer counters:
impressions, detail opens and contact-button actions. No user/device IDs, sessions,
coordinates, routes, event timestamps or event histories. No collection endpoint,
ad SDK or ingestion job is enabled. It contains no seeded marketing performance data.
Empty reports mean **no collected data**, not measured zero performance.

The admin endpoint reports at most200 business/week rows from the last30 completed
days. Current-day data is excluded. Weeks with fewer than20 impressions are suppressed;
all displayed counts round down to multiples of10. These are event counts, not unique
people, confirmed visits, calls or sales. Twenty events do not imply twenty people or
provide a formal anonymity guarantee. No location/demographic cohorts, drill-down,
individual journeys, click-through percentage or claimed conversion attribution.

Before collection launches, implement tested aggregate fraud controls, minimum group
thresholds after all filters, a capped contribution design that does not create trip
histories, and90-day aggregate retention. Any identifiers needed for fraud control need
their own privacy decision. Do not attach generic mobile analytics to navigation to
fill these metrics. Existing driver accounts and notification tokens must not be used
as advertising identifiers.

## Release gates

1. Core navigation/startup, GPS handling, voice priorities and maps are validated on
   actual Accra roads and representative low-end Android phones. Pending verification
   is not a pass, and test counts alone do not establish road stability.
2. Driver-safety UX and accessibility checks prove absence of all sponsored UI/audio
   throughout every active navigation state and during unsafe interactions.
3. Applicable legal/privacy and consent review, truthful advertiser terms, taxes,
   refunds, fraud controls and reporting ownership isolation are approved.
4. Businesses, current copy, location, evidence and expiry receive independent review.
5. A separately reviewed code/schema migration introduces publication/delivery and
   measurements behind a default-off kill switch. No automatic activation of drafts.

This change adds the **admin preparation only**. It neither certifies navigation stable
nor activates advertisements. No mobile APK rebuild is needed for these server/admin
changes.

## Verification

Database/API tests cover role restrictions, strict copy/targeting field schemas,
mandatory Sponsored labelling, stale reviews, API and database publication blocks,
absent public ad/event routes, audit revisions and aggregate suppression/rounding.
Browser tests cover read-only viewer access and the absence of a publication button.
Existing navigation accessibility tests assert absence of sponsored content.
