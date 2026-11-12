import type {Pool} from 'pg';
// This is a launch contract, not a feature flag. Enabling delivery requires a reviewed code/schema change.
export const sponsorshipModel={
 enabled:false,collectionEnabled:false,advertiserPortalEnabled:false,navigationAndSafetyFree:true,
 label:'Sponsored',status:'Prelaunch only — no paid campaigns, ad delivery or tracking',
 categories:['petrol_station','mechanic','tire_shop','car_wash','roadside_service'],
 pricing:{currency:'GHS',state:'Proposal only; no charges or checkout enabled',periodDays:30,plans:[{id:'proposal_basic',name:'Business listing',amount:100},{id:'proposal_featured',name:'Sponsored discovery placement',amount:250}],terms:'Flat fee per approved business location. No auction, per-click charges or guaranteed views, calls, sales or route placement. Confirm taxes, cancellation/refund terms and advertiser agreement before launch.'},
 targeting:'Future manual town/suburb selection and service category only. No current-trip targeting, sensitive traits, continuous location profiles or sale of driver data.',
 consent:'Future sponsored discovery must be optional, explained separately and off by default. Declining it never restricts navigation or safety. No advertising SDK, tracking cookie or event collector is installed.',
 ranking:'Sponsored entries occupy a separately labelled discovery section with fair rotation. Payment never changes organic search, route choice, ETA, safety warnings, road verification or emergency priority.',
 driving:'No sponsored pins, lists, pop-ups, audio, interstitials or overlays during any active navigation session, including paused/off-route/rerouting states. No promotional notifications.',
 analytics:'Admin-only weekly counts per business. Below20 impressions are suppressed; displayed counts round down to10. Counts are events, not people, verified visits or sales. No demographic, trip or location breakdowns.',
 launchGates:['Core navigation verified on real Accra roads and low-end Android','Driver UX and no-ad navigation checks signed off','Consent, data retention and applicable legal review complete','Business identity, location, truthful copy, public contact and pricing evidence reviewed independently','Advertiser terms, billing/refunds, reporting access isolation and aggregate fraud controls approved','Separate reviewed code/schema release to enable delivery'],
} as const;
export async function sponsoredAnalytics(db:Pool){return(await db.query(`SELECT m.listing_id,l.business_name,date_trunc('week',m.day::timestamp)::date::text AS week,
 (floor(sum(m.impressions)/10.0)*10)::bigint::text AS impressions,
 (floor(sum(m.opens)/10.0)*10)::bigint::text AS opens,
 (floor(sum(m.contact_actions)/10.0)*10)::bigint::text AS contact_actions
 FROM sponsored_daily_metrics m JOIN sponsored_listings l ON l.id=m.listing_id
 WHERE m.day>=current_date-30 AND m.day<current_date AND m.day>=l.valid_from::date AND m.day<=l.expires_at::date
 GROUP BY m.listing_id,l.business_name,date_trunc('week',m.day::timestamp)
 HAVING sum(m.impressions)>=20 ORDER BY week DESC,m.listing_id LIMIT 200`)).rows;}
