-- Operator-reviewed compliance events only. No camera dataset is imported.
CREATE TABLE driver_compliance_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN ('transition','corridor')),
 geometry geometry(LineString,4326) NOT NULL CHECK(rova_valid_wgs84(geometry) AND ST_Length(geometry::geography) BETWEEN 30 AND 20000),
 approach_segment_id uuid NOT NULL REFERENCES road_segments(id), target_segment_id uuid NOT NULL REFERENCES road_segments(id),
 target_rule_id uuid REFERENCES speed_limit_rules(id), target_rule_revision integer,
 enforcement_zone_id uuid REFERENCES enforcement_zones(id),
 enforcement_type text NOT NULL DEFAULT 'unknown' CHECK(enforcement_type IN ('fixed_speed','average_speed','red_light','combined','checkpoint','unknown')),
 source_id uuid NOT NULL REFERENCES data_sources(id), source_reference text NOT NULL CHECK(length(trim(source_reference))>0),
 legal_applicability text NOT NULL DEFAULT 'unconfirmed' CHECK(legal_applicability IN ('confirmed','unconfirmed')),
 confidence double precision NOT NULL CHECK(confidence BETWEEN 0 AND 1), accuracy_meters double precision NOT NULL CHECK(accuracy_meters BETWEEN 0 AND 10),
 is_synthetic boolean NOT NULL DEFAULT false, approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending_review','published','withdrawn','rejected')),
 valid_from timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>valid_from),
 created_by text NOT NULL, reviewed_by text, reviewed_at timestamptz, approved_by text, approved_at timestamptz,
 CHECK((kind='transition' AND target_rule_id IS NOT NULL AND target_rule_revision IS NOT NULL AND target_rule_revision>0 AND enforcement_zone_id IS NULL AND enforcement_type='unknown')
    OR (kind='corridor' AND enforcement_zone_id IS NOT NULL AND target_rule_id IS NULL AND target_rule_revision IS NULL)),
 CHECK(NOT is_synthetic OR approval_status<>'published')
);
CREATE INDEX compliance_entry_geography_idx ON driver_compliance_events USING gist((ST_StartPoint(geometry)::geography));
CREATE INDEX compliance_road_idx ON driver_compliance_events(approach_segment_id,target_segment_id);
CREATE FUNCTION guard_compliance_event() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE src data_sources; approach road_segments; target road_segments; z enforcement_zones; rule speed_limit_rules; BEGIN
 SELECT * INTO src FROM data_sources WHERE id=NEW.source_id;
 SELECT * INTO approach FROM road_segments WHERE id=NEW.approach_segment_id;
 SELECT * INTO target FROM road_segments WHERE id=NEW.target_segment_id;
 IF TG_OP='UPDATE' THEN
  IF OLD.is_synthetic AND NOT NEW.is_synthetic THEN RAISE EXCEPTION 'Synthetic provenance is permanent' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)-ARRAY['revision','approval_status','reviewed_by','reviewed_at','approved_by','approved_at']) IS DISTINCT FROM
     (to_jsonb(NEW)-ARRAY['revision','approval_status','reviewed_by','reviewed_at','approved_by','approved_at']) THEN
   IF NEW.approval_status='published' THEN RAISE EXCEPTION 'Return event to review before editing content' USING ERRCODE='23514'; END IF;
   NEW.revision:=OLD.revision+1; NEW.reviewed_by:=NULL; NEW.reviewed_at:=NULL; NEW.approved_by:=NULL; NEW.approved_at:=NULL;
  ELSE NEW.revision:=OLD.revision; END IF;
 END IF;
 IF src.is_synthetic OR approach.is_synthetic OR target.is_synthetic THEN NEW.is_synthetic:=true; END IF;
 IF NEW.approval_status='published' THEN
  IF NEW.is_synthetic OR src.kind<>'official' OR src.approval_status NOT IN ('approved','published')
   OR approach.approval_status<>'published' OR target.approval_status<>'published'
   OR NEW.legal_applicability<>'confirmed' OR NEW.confidence<0.95
   OR NEW.reviewed_by IS NULL OR NEW.approved_by IS NULL OR NEW.reviewed_by=NEW.created_by OR NEW.approved_by=NEW.created_by OR NEW.approved_by=NEW.reviewed_by
   OR NEW.reviewed_at IS NULL OR NEW.approved_at IS NULL OR NEW.reviewed_at>now() OR NEW.approved_at>now()
   OR NEW.reviewed_at<now()-interval '180 days' OR NEW.approved_at<now()-interval '180 days'
  THEN RAISE EXCEPTION 'Publication requires current official provenance, applicability and two independent reviewers' USING ERRCODE='23514'; END IF;
  IF NOT ST_DWithin(NEW.geometry::geography,target.geometry::geography,10) OR NOT ST_CoveredBy(NEW.geometry::geography,ST_Buffer(target.geometry::geography,10))
  THEN RAISE EXCEPTION 'Event path must follow the target road' USING ERRCODE='23514'; END IF;
  IF NEW.kind='transition' THEN
   SELECT * INTO rule FROM speed_limit_rules WHERE id=NEW.target_rule_id;
   IF rule.road_segment_id<>target.id OR rule.revision<>NEW.target_rule_revision OR rule.status<>'published'
    OR NOT (ST_DWithin(ST_StartPoint(NEW.geometry)::geography,ST_StartPoint(target.geometry)::geography,10) OR ST_DWithin(ST_StartPoint(NEW.geometry)::geography,ST_EndPoint(target.geometry)::geography,10))
    OR NOT (ST_DWithin(ST_StartPoint(NEW.geometry)::geography,ST_StartPoint(approach.geometry)::geography,10) OR ST_DWithin(ST_StartPoint(NEW.geometry)::geography,ST_EndPoint(approach.geometry)::geography,10))
   THEN RAISE EXCEPTION 'Transition must join reviewed approach and target rule boundary' USING ERRCODE='23514'; END IF;
  ELSE
   SELECT * INTO z FROM enforcement_zones WHERE id=NEW.enforcement_zone_id;
   IF z.is_synthetic OR z.approval_status<>'published' OR z.source_id<>NEW.source_id OR z.confidence<0.95 OR z.confidence IS NULL
    OR NOT ST_CoveredBy(NEW.geometry,z.geometry)
   THEN RAISE EXCEPTION 'Corridor requires approved official zone covering its path' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER compliance_event_guard BEFORE INSERT OR UPDATE ON driver_compliance_events FOR EACH ROW EXECUTE FUNCTION guard_compliance_event();
CREATE TRIGGER compliance_event_audit AFTER INSERT OR UPDATE OR DELETE ON driver_compliance_events FOR EACH ROW EXECUTE FUNCTION audit_record_change();

-- Read role sees only current real event candidates. API still validates route alignment and target rule proof.
CREATE FUNCTION rova_compliance_candidates(longitude double precision,latitude double precision,segment uuid)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF longitude NOT BETWEEN -180 AND 180 OR latitude NOT BETWEEN -90 AND 90 THEN RAISE EXCEPTION 'Invalid point'; END IF;
 RETURN QUERY SELECT jsonb_build_object('id',e.id,'revision',e.revision,'kind',e.kind,'geometry',ST_AsGeoJSON(e.geometry)::jsonb,
  'targetSegmentId',e.target_segment_id,'targetRuleId',e.target_rule_id,'targetRuleRevision',e.target_rule_revision,
  'enforcementType',e.enforcement_type,'confidence',e.confidence,'accuracyMeters',e.accuracy_meters,
  'effectiveFrom',e.valid_from,'expiresAt',e.expires_at,'reviewedAt',least(e.reviewed_at,e.approved_at),'sourceReference',e.source_reference,
  'probe',jsonb_build_array(ST_X(ST_LineInterpolatePoint(e.geometry,0.5)),ST_Y(ST_LineInterpolatePoint(e.geometry,0.5))),
  'probeHeading',degrees(ST_Azimuth(ST_LineInterpolatePoint(e.geometry,0.45)::geography,ST_LineInterpolatePoint(e.geometry,0.55)::geography)))
 FROM driver_compliance_events e JOIN data_sources s ON s.id=e.source_id
 JOIN published_road_segments r ON r.id=e.target_segment_id
 WHERE segment IN (e.approach_segment_id,e.target_segment_id) AND e.approval_status='published' AND NOT e.is_synthetic
 AND e.legal_applicability='confirmed' AND e.confidence>=0.95 AND e.valid_from<=now() AND e.expires_at>now()
 AND e.reviewed_at BETWEEN now()-interval '180 days' AND now() AND e.approved_at BETWEEN now()-interval '180 days' AND now()
 AND s.kind='official' AND s.approval_status IN ('approved','published') AND NOT s.is_synthetic
 AND s.approved_at BETWEEN now()-interval '365 days' AND now() AND (s.valid_from IS NULL OR s.valid_from<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
 AND ST_DWithin(ST_StartPoint(e.geometry)::geography,ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography,600)
 AND (e.kind='transition' OR EXISTS(SELECT 1 FROM enforcement_zones z WHERE z.id=e.enforcement_zone_id AND z.approval_status='published' AND NOT z.is_synthetic
  AND z.source_id=e.source_id AND z.confidence>=0.95 AND z.accuracy_meters<=10 AND z.approved_at BETWEEN now()-interval '180 days' AND now()
  AND z.valid_from IS NOT NULL AND z.valid_from<=now() AND z.expires_at IS NOT NULL AND z.expires_at>now() AND ST_CoveredBy(e.geometry,z.geometry)))
 ORDER BY ST_Distance(ST_StartPoint(e.geometry)::geography,ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography),e.id LIMIT 17;
END $$;
REVOKE ALL ON FUNCTION rova_compliance_candidates(double precision,double precision,uuid) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rova_reader') THEN GRANT EXECUTE ON FUNCTION rova_compliance_candidates(double precision,double precision,uuid) TO rova_reader; END IF; END $$;
