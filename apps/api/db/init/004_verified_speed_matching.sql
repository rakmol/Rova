ALTER TABLE road_segments
 ADD COLUMN road_kind text NOT NULL DEFAULT 'unknown' CHECK(road_kind IN ('road','ramp','service','unknown')),
 ADD COLUMN grade_level integer CHECK(grade_level BETWEEN -10 AND 20),
 ADD COLUMN road_width_meters double precision CHECK(road_width_meters BETWEEN 1 AND 60),
 ADD COLUMN last_reviewed_at timestamptz;
ALTER TABLE speed_limit_rules
 ADD COLUMN units text NOT NULL DEFAULT 'km/h' CHECK(units='km/h'),
 ADD COLUMN evidence_type text NOT NULL DEFAULT 'unspecified' CHECK(evidence_type IN ('posted_signage','official_record','general_default','unspecified')),
 ADD COLUMN legal_applicability text NOT NULL DEFAULT 'unconfirmed' CHECK(legal_applicability IN ('confirmed','unconfirmed')),
 ADD COLUMN rule_role text NOT NULL DEFAULT 'road_limit' CHECK(rule_role IN ('road_limit','vehicle_cap')),
 ADD COLUMN last_reviewed_at timestamptz,
 ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 ADD COLUMN supersedes_rule_id uuid REFERENCES speed_limit_rules(id),
 ADD CONSTRAINT speed_limit_rule_no_self_supersession CHECK(supersedes_rule_id IS NULL OR supersedes_rule_id<>id),
 ADD CONSTRAINT speed_limit_rule_vehicle_check CHECK(vehicle_class IN ('all','private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle'));
ALTER TABLE speed_rule_approvals
 ADD COLUMN rule_revision integer NOT NULL DEFAULT 1 CHECK(rule_revision>0),
 ADD COLUMN reviewed_at timestamptz;
UPDATE speed_rule_approvals SET reviewed_at=created_at;
ALTER TABLE speed_rule_approvals ALTER COLUMN reviewed_at SET NOT NULL, ALTER COLUMN reviewed_at SET DEFAULT now();
ALTER TABLE speed_rule_approvals DROP CONSTRAINT speed_rule_approvals_speed_rule_id_reviewer_id_key;
ALTER TABLE speed_rule_approvals ADD UNIQUE(speed_rule_id,reviewer_id,rule_revision);
CREATE INDEX speed_rule_approvals_current_idx ON speed_rule_approvals(speed_rule_id,rule_revision,decision);
CREATE INDEX road_segments_geography_idx ON road_segments USING gist((geometry::geography));
CREATE INDEX speed_limit_rules_matching_idx ON speed_limit_rules(road_segment_id,vehicle_class,effective_from);
-- New metadata is unknown until reviewed; preserve all historical rows and decisions.
UPDATE speed_limit_rules SET status='pending_review' WHERE status IN ('approved','published');

CREATE FUNCTION guard_speed_rule_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE target speed_limit_rules; BEGIN
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(OLD)-ARRAY['status','approved_by','approved_at','verified_by','verified_at','last_reviewed_at','revision']) IS DISTINCT FROM
     (to_jsonb(NEW)-ARRAY['status','approved_by','approved_at','verified_by','verified_at','last_reviewed_at','revision']) THEN
   IF NEW.status IN ('approved','published') THEN RAISE EXCEPTION 'Content changes require a new reviewed revision' USING ERRCODE='23514'; END IF;
   NEW.revision:=OLD.revision+1;
  ELSE NEW.revision:=OLD.revision; END IF;
 END IF;
 IF NEW.supersedes_rule_id IS NOT NULL THEN
  SELECT * INTO target FROM speed_limit_rules WHERE id=NEW.supersedes_rule_id;
  IF target.id IS NULL OR target.road_segment_id<>NEW.road_segment_id OR target.rule_role<>NEW.rule_role
   OR (target.vehicle_class<>NEW.vehicle_class AND target.vehicle_class<>'all')
   OR (target.direction<>NEW.direction AND target.direction<>'both')
  THEN RAISE EXCEPTION 'Supersession must have compatible road, direction, vehicle and role scope' USING ERRCODE='23514'; END IF;
  IF EXISTS(WITH RECURSIVE chain AS (
   SELECT id,supersedes_rule_id FROM speed_limit_rules WHERE id=NEW.supersedes_rule_id
   UNION SELECT r.id,r.supersedes_rule_id FROM speed_limit_rules r JOIN chain c ON r.id=c.supersedes_rule_id
  ) SELECT 1 FROM chain WHERE id=NEW.id) THEN RAISE EXCEPTION 'Cyclic supersession is not permitted' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status IN ('approved','published') AND
   (NEW.effective_from IS NULL OR NEW.last_reviewed_at IS NULL OR NEW.last_reviewed_at>now()+interval '2 minutes'
    OR NEW.evidence_type='unspecified' OR NEW.legal_applicability<>'confirmed')
 THEN RAISE EXCEPTION 'Publication requires effective date, review date and confirmed evidence applicability' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER a_speed_rule_revision BEFORE INSERT OR UPDATE ON speed_limit_rules FOR EACH ROW EXECUTE FUNCTION guard_speed_rule_revision();
CREATE FUNCTION guard_road_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF NEW.approval_status IN ('approved','published') AND (NEW.road_kind='unknown' OR NEW.last_reviewed_at IS NULL OR NEW.last_reviewed_at>now()+interval '2 minutes')
 THEN RAISE EXCEPTION 'Road approval requires classified geometry and a review date' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER road_review_guard BEFORE INSERT OR UPDATE ON road_segments FOR EACH ROW EXECUTE FUNCTION guard_road_review();
CREATE OR REPLACE FUNCTION require_independent_speed_rule_approvals() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IN ('approved','published') AND (SELECT count(DISTINCT reviewer_id) FROM speed_rule_approvals
  WHERE speed_rule_id=NEW.id AND rule_revision=NEW.revision AND decision='approve' AND reviewer_id<>NEW.created_by)<2
 THEN RAISE EXCEPTION 'Current rule revision requires two independent approvals' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION guard_speed_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current_rule speed_limit_rules; BEGIN
 SELECT * INTO current_rule FROM speed_limit_rules WHERE id=NEW.speed_rule_id;
 IF current_rule.id IS NULL OR NEW.rule_revision<>current_rule.revision OR NEW.reviewer_id=current_rule.created_by
 THEN RAISE EXCEPTION 'Reviewer must independently review the current rule revision' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.speed_rule_id<>NEW.speed_rule_id OR OLD.reviewer_id<>NEW.reviewer_id OR OLD.rule_revision<>NEW.rule_revision)
 THEN RAISE EXCEPTION 'Review identity and revision cannot be reassigned' USING ERRCODE='23514'; END IF;
 NEW.reviewed_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER speed_review_guard BEFORE INSERT OR UPDATE ON speed_rule_approvals FOR EACH ROW EXECUTE FUNCTION guard_speed_review();
CREATE FUNCTION audit_speed_review() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb; BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO audit_logs(actor_id,entity_type,entity_id,action,reason,metadata)
 VALUES(row_data->>'reviewer_id','speed_limit_rule',(row_data->>'speed_rule_id')::uuid,'review_'||lower(TG_OP),row_data->>'reason',
  jsonb_build_object('revision',row_data->'rule_revision','decision',row_data->>'decision'));
 RETURN NULL;
END $$;
CREATE TRIGGER speed_review_audit AFTER INSERT OR UPDATE OR DELETE ON speed_rule_approvals FOR EACH ROW EXECUTE FUNCTION audit_speed_review();

CREATE OR REPLACE VIEW published_speed_limit_rules AS
 SELECT r.* FROM speed_limit_rules r JOIN published_road_segments segment ON segment.id=r.road_segment_id JOIN data_sources s ON s.id=r.source_id
 WHERE r.status='published' AND NOT r.is_synthetic AND NOT s.is_synthetic AND s.approval_status IN ('approved','published')
 AND r.effective_from IS NOT NULL AND r.effective_from<=now() AND (r.expires_at IS NULL OR r.expires_at>now())
 AND r.legal_applicability='confirmed' AND r.evidence_type<>'unspecified' AND r.last_reviewed_at IS NOT NULL
 AND (s.valid_from IS NULL OR s.valid_from<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
 AND (SELECT count(DISTINCT a.reviewer_id) FROM speed_rule_approvals a WHERE a.speed_rule_id=r.id AND a.rule_revision=r.revision AND a.decision='approve' AND a.reviewer_id<>r.created_by)>=2;

-- Bounded internal read surface. Includes unverified roads so they are not silently
-- ignored when detecting ramp, parallel-road or junction ambiguity.
CREATE FUNCTION rova_speed_limit_candidates(longitude double precision,latitude double precision,radius_m double precision,vehicle text)
RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF longitude IS NULL OR latitude IS NULL OR radius_m IS NULL OR vehicle IS NULL OR NOT longitude BETWEEN -180 AND 180 OR NOT latitude BETWEEN -90 AND 90
  OR NOT radius_m BETWEEN 1 AND 100 OR vehicle NOT IN ('private_car','taxi','motorcycle','commercial_vehicle','bus','heavy_vehicle')
 THEN RAISE EXCEPTION 'Invalid bounded safety lookup' USING ERRCODE='22023'; END IF;
 RETURN QUERY WITH point AS (SELECT ST_SetSRID(ST_MakePoint(longitude,latitude),4326) AS geom),
 nearby AS (
  SELECT r.*,ST_Distance(r.geometry::geography,p.geom::geography) AS distance_m,
   ST_LineLocatePoint(r.geometry,p.geom) AS fraction,ST_Length(r.geometry::geography) AS length_m
  FROM road_segments r CROSS JOIN point p LEFT JOIN data_sources rs ON rs.id=r.source_id
  WHERE NOT r.is_synthetic AND NOT coalesce(rs.is_synthetic,false)
   AND ST_DWithin(r.geometry::geography,p.geom::geography,radius_m)
  ORDER BY ST_Distance(r.geometry::geography,p.geom::geography),r.id LIMIT 17
 ) SELECT jsonb_build_object(
  'id',r.id,'distanceMeters',r.distance_m,'roadKind',r.road_kind,'gradeLevel',r.grade_level,'roadWidthMeters',r.road_width_meters,'direction',r.direction,
  'bearing',degrees(ST_Azimuth(ST_LineInterpolatePoint(r.geometry,greatest(0,r.fraction-5/greatest(1,r.length_m)))::geography,ST_LineInterpolatePoint(r.geometry,least(1,r.fraction+5/greatest(1,r.length_m)))::geography)),
  'endpointMeters',least(ST_Distance(ST_StartPoint(r.geometry)::geography,p.geom::geography),ST_Distance(ST_EndPoint(r.geometry)::geography,p.geom::geography)),
  'confidence',r.confidence,'accuracyMeters',r.accuracy_meters,'status',r.approval_status,'synthetic',r.is_synthetic,
  'validFrom',r.valid_from,'expiresAt',r.expires_at,'lastReviewedAt',r.last_reviewed_at,
  'source',(SELECT jsonb_build_object('id',s.id,'kind',s.kind,'status',s.approval_status,'synthetic',s.is_synthetic,'reviewedAt',s.approved_at,'validFrom',s.valid_from,'expiresAt',s.expires_at,'document',s.reference,'url',s.source_url) FROM data_sources s WHERE s.id=r.source_id),
  'rules',coalesce((SELECT jsonb_agg(item) FROM (
   SELECT jsonb_build_object('id',v.id,'speedLimitKmh',v.speed_limit_kmh,'units',v.units,'vehicleClass',v.vehicle_class,'direction',v.direction,'role',v.rule_role,'evidenceType',v.evidence_type,'legalApplicability',v.legal_applicability,
    'status',v.status,'synthetic',v.is_synthetic,'confidence',v.confidence,'effectiveFrom',v.effective_from,'expiresAt',v.expires_at,'lastReviewedAt',v.last_reviewed_at,'revision',v.revision,'supersedesId',v.supersedes_rule_id,'reference',v.source_reference,
    'source',(SELECT jsonb_build_object('id',s.id,'kind',s.kind,'status',s.approval_status,'synthetic',s.is_synthetic,'reviewedAt',s.approved_at,'validFrom',s.valid_from,'expiresAt',s.expires_at,'document',s.reference,'url',coalesce(v.source_url,s.source_url)) FROM data_sources s WHERE s.id=v.source_id),
    'approvals',(SELECT count(DISTINCT a.reviewer_id) FROM speed_rule_approvals a WHERE a.speed_rule_id=v.id AND a.rule_revision=v.revision AND a.decision='approve' AND a.reviewer_id<>v.created_by),
    'oldestApprovalAt',(SELECT min(a.reviewed_at) FROM speed_rule_approvals a WHERE a.speed_rule_id=v.id AND a.rule_revision=v.revision AND a.decision='approve' AND a.reviewer_id<>v.created_by),
    'auditLogId',(SELECT max(a.id)::text FROM audit_logs a WHERE a.entity_id=v.id AND a.entity_type IN ('speed_limit_rules','speed_limit_rule','speed_rule'))
   ) AS item FROM speed_limit_rules v WHERE v.road_segment_id=r.id AND v.vehicle_class IN (vehicle,'all') ORDER BY v.effective_from DESC NULLS LAST,v.id LIMIT 17
  ) records),'[]'::jsonb)
 ) FROM nearby r CROSS JOIN point p;
END $$;
REVOKE ALL ON FUNCTION rova_speed_limit_candidates(double precision,double precision,double precision,text) FROM PUBLIC;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rova_reader') THEN GRANT EXECUTE ON FUNCTION rova_speed_limit_candidates(double precision,double precision,double precision,text) TO rova_reader; END IF; END $$;
