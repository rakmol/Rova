-- Admin preparation only. There is deliberately no publishable state or public ad view.
CREATE TABLE sponsored_listings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_name text NOT NULL CHECK(length(trim(business_name)) BETWEEN 1 AND 120),
 category text NOT NULL CHECK(category IN ('petrol_station','mechanic','tire_shop','car_wash','roadside_service')),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 280),
 geometry geometry(Point,4326) NOT NULL CHECK(rova_valid_wgs84(geometry)),
 CHECK(ST_X(geometry) BETWEEN -4 AND 2 AND ST_Y(geometry) BETWEEN 4 AND 12),
 address text NOT NULL CHECK(length(trim(address)) BETWEEN 1 AND 300), region text NOT NULL CHECK(length(trim(region)) BETWEEN 1 AND 100),
 website text CHECK(website IS NULL OR website ~ '^https://'), contact_phone text NOT NULL CHECK(length(contact_phone) BETWEEN 7 AND 30),
 business_evidence_url text NOT NULL CHECK(business_evidence_url ~ '^https://'), evidence_reference text NOT NULL CHECK(length(trim(evidence_reference)) BETWEEN 1 AND 1000),
 sponsor_label text NOT NULL DEFAULT 'Sponsored' CHECK(sponsor_label='Sponsored'),
 price_plan text NOT NULL CHECK(price_plan IN ('proposal_basic','proposal_featured')),
 valid_from timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>valid_from),
 approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending_review','rejected','withdrawn')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 approved_by text, approved_at timestamptz, admin_revision_seq integer NOT NULL DEFAULT 0 CHECK(admin_revision_seq>=0)
);
CREATE INDEX sponsored_business_geo ON sponsored_listings USING gist(geometry);
ALTER TABLE admin_revisions DROP CONSTRAINT admin_revisions_entity_check;
ALTER TABLE admin_revisions ADD CONSTRAINT admin_revisions_entity_check CHECK(entity IN ('source','road','rule','zone','hazard','policy','sponsor'));
CREATE TRIGGER sponsored_record_audit AFTER INSERT OR UPDATE OR DELETE ON sponsored_listings FOR EACH ROW EXECUTE FUNCTION audit_record_change();
-- Future aggregate import format only: no collection API, device ID, user ID, GPS or event histories.
CREATE TABLE sponsored_daily_metrics (
 listing_id uuid NOT NULL REFERENCES sponsored_listings(id) ON DELETE CASCADE, day date NOT NULL,
 impressions integer NOT NULL CHECK(impressions BETWEEN 0 AND 1000000000),
 opens integer NOT NULL CHECK(opens BETWEEN 0 AND 1000000000),
 contact_actions integer NOT NULL CHECK(contact_actions BETWEEN 0 AND 1000000000),
 PRIMARY KEY(listing_id,day)
);
ALTER TABLE sponsored_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsored_daily_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sponsored_listings,sponsored_daily_metrics FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
   EXECUTE format('REVOKE ALL ON sponsored_listings,sponsored_daily_metrics FROM %I',role_name);
  END IF;
 END LOOP;
END $$;
