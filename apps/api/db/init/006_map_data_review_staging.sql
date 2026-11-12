-- Provider data remains isolated from the driver-facing road/rule tables.
CREATE TABLE map_data_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content_sha256 char(64) NOT NULL UNIQUE CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 provider text NOT NULL CHECK(provider='OpenStreetMap / Geofabrik'),
 source_url text NOT NULL CHECK(source_url='https://download.geofabrik.de/africa/ghana.html'),
 license text NOT NULL CHECK(license='ODbL-1.0'), attribution text NOT NULL CHECK(attribution='© OpenStreetMap contributors'),
 imported_by text NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(),
 source_snapshot_at timestamptz NOT NULL,
 accepted_count integer NOT NULL CHECK(accepted_count>=0), skipped_count integer NOT NULL CHECK(skipped_count>=0)
);
CREATE TABLE map_road_candidates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES map_data_import_batches(id),
 osm_way_id bigint NOT NULL CHECK(osm_way_id>0), osm_version integer NOT NULL CHECK(osm_version>0),
 osm_edited_at timestamptz NOT NULL,
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
 geometry geometry(LineString,4326) NOT NULL CHECK(rova_valid_wgs84(geometry) AND ST_Length(geometry::geography)>0),
 road_name text, road_class text NOT NULL,
 raw_tags jsonb NOT NULL CHECK(jsonb_typeof(raw_tags)='object'),
 proposed_rules jsonb NOT NULL CHECK(jsonb_typeof(proposed_rules)='array'),
 review_issues jsonb NOT NULL CHECK(jsonb_typeof(review_issues)='array'),
 review_state text NOT NULL DEFAULT 'pending_review' CHECK(review_state='pending_review'),
 UNIQUE(osm_way_id,osm_version)
);
CREATE INDEX map_candidates_geometry_idx ON map_road_candidates USING gist(geometry);
CREATE INDEX map_candidates_name_idx ON map_road_candidates(road_name);
CREATE TRIGGER map_candidates_audit AFTER INSERT ON map_road_candidates FOR EACH ROW EXECUTE FUNCTION audit_record_change();
CREATE TRIGGER map_candidates_immutable BEFORE UPDATE OR DELETE ON map_road_candidates FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER map_batches_immutable BEFORE UPDATE OR DELETE ON map_data_import_batches FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
-- No grants to rova_reader. A separate controlled review process creates legally
-- applicable road/rule records with documented evidence and real reviewers.
