-- Community evidence stays outside authority publication/approval workflows.
ALTER TABLE incident_reports DROP CONSTRAINT incident_reports_incident_type_check;
ALTER TABLE incident_reports ADD CONSTRAINT incident_reports_incident_type_check
 CHECK(incident_type IN ('collision','hazard','closure','flood','other','pothole','congestion','obstacle'));
ALTER TABLE incident_reports ADD COLUMN community_status text
 CHECK(community_status IN ('pending','verified','rejected','expired')),
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE incident_reports ADD CONSTRAINT community_not_authority
 CHECK(community_status IS NULL OR (approval_status='draft' AND source_id IS NULL AND NOT is_synthetic
 AND expires_at IS NOT NULL AND accuracy_meters IS NOT NULL AND accuracy_meters>=100
 AND abs(ST_X(geometry)*1000-round(ST_X(geometry)*1000))<0.000001
 AND abs(ST_Y(geometry)*1000-round(ST_Y(geometry)*1000))<0.000001));
CREATE INDEX incident_community_geography_idx ON incident_reports USING gist((geometry::geography)) WHERE community_status IS NOT NULL;
CREATE TABLE incident_sessions (
 token_hash char(64) PRIMARY KEY, device_id uuid NOT NULL UNIQUE REFERENCES devices(id),
 expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE incident_abuse_buckets (
 bucket_key char(64) NOT NULL, window_start timestamptz NOT NULL,
 count integer NOT NULL CHECK(count>0), PRIMARY KEY(bucket_key,window_start)
);
-- No reporter identity, notes, vote locations or device identifiers in this view.
CREATE VIEW community_incident_summary AS
 SELECT r.id,r.incident_type AS category,
 CASE WHEN r.expires_at<=now() THEN 'expired' ELSE r.community_status END AS status,
 ST_X(r.geometry) AS lon,ST_Y(r.geometry) AS lat,r.accuracy_meters,
 r.observed_at,r.expires_at,r.revision,
 count(c.id) FILTER(WHERE c.decision='confirm')::integer AS confirmations,
 count(c.id) FILTER(WHERE c.decision IN ('deny','resolved'))::integer AS not_there
 FROM incident_reports r LEFT JOIN incident_confirmations c ON c.incident_report_id=r.id
 WHERE r.community_status IS NOT NULL AND NOT r.is_synthetic GROUP BY r.id;
REVOKE ALL ON incident_sessions,incident_abuse_buckets,community_incident_summary FROM PUBLIC;
