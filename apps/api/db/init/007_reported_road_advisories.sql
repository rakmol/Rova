-- Explicitly UNVERIFIED road-level awareness; never camera coordinates or legal rules.
CREATE TABLE reported_road_advisories (
 id uuid PRIMARY KEY, road_name text NOT NULL CHECK(length(road_name) BETWEEN 1 AND 200),
 road_key text NOT NULL UNIQUE, city text NOT NULL CHECK(city IN ('accra','kumasi')),
 verification text NOT NULL DEFAULT 'unverified' CHECK(verification='unverified'),
 scope text NOT NULL DEFAULT 'named_road_not_camera' CHECK(scope='named_road_not_camera'),
 source_url text NOT NULL CHECK(source_url ~ '^https://'), report_ids jsonb NOT NULL CHECK(jsonb_typeof(report_ids)='array'),
 reported_at timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>reported_at),
 enabled boolean NOT NULL DEFAULT true, imported_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reported_road_advisory_segments (
 advisory_id uuid NOT NULL REFERENCES reported_road_advisories(id),
 candidate_id uuid NOT NULL REFERENCES map_road_candidates(id), PRIMARY KEY(advisory_id,candidate_id)
);
CREATE INDEX map_candidates_geography_idx ON map_road_candidates USING gist((geometry::geography));
CREATE TRIGGER reported_roads_audit AFTER INSERT OR UPDATE OR DELETE ON reported_road_advisories FOR EACH ROW EXECUTE FUNCTION audit_record_change();
CREATE FUNCTION rova_reported_road_candidates(longitude double precision,latitude double precision)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF longitude NOT BETWEEN -180 AND 180 OR latitude NOT BETWEEN -90 AND 90 THEN RAISE EXCEPTION 'Invalid point'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',a.id,'roadName',a.road_name,'sourceUrl',a.source_url,'reportedAt',a.reported_at,'geometry',ST_AsGeoJSON(c.geometry)::jsonb)
 FROM reported_road_advisories a JOIN reported_road_advisory_segments s ON s.advisory_id=a.id JOIN map_road_candidates c ON c.id=s.candidate_id
 WHERE a.enabled AND a.expires_at>now() AND a.reported_at<=now()
 AND ST_DWithin(c.geometry::geography,ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography,700)
 ORDER BY ST_Distance(c.geometry::geography,ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography),a.id,c.osm_way_id LIMIT 257;
END $$;
REVOKE ALL ON FUNCTION rova_reported_road_candidates(double precision,double precision) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rova_reader') THEN GRANT EXECUTE ON FUNCTION rova_reported_road_candidates(double precision,double precision) TO rova_reader; END IF; END $$;
