-- Forward-only migration. Existing records are preserved; unreviewed legacy sources
-- cannot keep rules driver-facing merely because an old status was published.
ALTER TABLE speed_rules RENAME TO speed_limit_rules;
ALTER TABLE audit_events RENAME TO audit_logs;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER FUNCTION require_independent_speed_rule_approvals() SET search_path=public,pg_temp;

CREATE FUNCTION rova_valid_wgs84(g geometry) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $$
 SELECT ST_SRID(g)=4326 AND ST_NDims(g)=2 AND NOT ST_IsEmpty(g) AND ST_IsValid(g)
   AND ST_XMin(Box3D(g)) >= -180 AND ST_XMax(Box3D(g)) <= 180
   AND ST_YMin(Box3D(g)) >= -90 AND ST_YMax(Box3D(g)) <= 90
$$;

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), external_subject text UNIQUE,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 platform text NOT NULL CHECK(platform IN ('android','ios','web')),
 notifications_opt_in boolean NOT NULL DEFAULT false, consented_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz,
 CHECK(NOT notifications_opt_in OR consented_at IS NOT NULL)
);
CREATE INDEX devices_user_idx ON devices(user_id);
CREATE TABLE push_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('fcm','apns','expo')),
 token_ciphertext bytea NOT NULL CHECK(octet_length(token_ciphertext)>0),
 encryption_key_id text NOT NULL CHECK(length(trim(encryption_key_id))>0),
 token_fingerprint char(64) NOT NULL UNIQUE CHECK(token_fingerprint ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz, revoked_at timestamptz,
 CHECK(expires_at IS NULL OR expires_at>created_at)
);
CREATE INDEX push_tokens_device_idx ON push_tokens(device_id) WHERE revoked_at IS NULL;

CREATE TABLE data_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('official','field_audit','provider','user_report','synthetic')),
 authority text NOT NULL CHECK(length(trim(authority))>0), title text NOT NULL CHECK(length(trim(title))>0),
 reference text NOT NULL CHECK(length(trim(reference))>0), source_url text CHECK(source_url IS NULL OR source_url ~ '^https?://'),
 license_note text NOT NULL DEFAULT 'Unknown; review required', published_at timestamptz,
 valid_from timestamptz, expires_at timestamptz,
 approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending_review','approved','published','rejected','withdrawn')),
 is_synthetic boolean GENERATED ALWAYS AS (kind='synthetic') STORED,
 created_by text NOT NULL, approved_by text, approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,authority,reference),
 CHECK(expires_at IS NULL OR valid_from IS NULL OR expires_at>valid_from),
 CHECK(kind<>'synthetic' OR approval_status NOT IN ('approved','published')),
 CHECK(approval_status NOT IN ('approved','published') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by<>created_by))
);

ALTER TABLE road_segments
 ADD COLUMN source_id uuid REFERENCES data_sources(id), ADD COLUMN source_reference text,
 ADD COLUMN is_synthetic boolean NOT NULL DEFAULT false,
 ADD COLUMN approval_status text NOT NULL DEFAULT 'draft',
 ADD COLUMN accuracy_meters double precision, ADD COLUMN confidence double precision,
 ADD COLUMN valid_from timestamptz, ADD COLUMN expires_at timestamptz,
 ADD COLUMN created_by text NOT NULL DEFAULT 'legacy-migration', ADD COLUMN approved_by text, ADD COLUMN approved_at timestamptz,
 ADD CONSTRAINT road_segments_status_check CHECK(approval_status IN ('draft','pending_review','approved','published','rejected','withdrawn')),
 ADD CONSTRAINT road_segments_geometry_valid CHECK(rova_valid_wgs84(geometry) AND ST_Length(geometry)>0),
 ADD CONSTRAINT road_segments_accuracy_check CHECK(accuracy_meters IS NULL OR (accuracy_meters>=0 AND accuracy_meters<'Infinity'::float8)),
 ADD CONSTRAINT road_segments_confidence_check CHECK(confidence BETWEEN 0 AND 1),
 ADD CONSTRAINT road_segments_dates_check CHECK(expires_at IS NULL OR valid_from IS NULL OR expires_at>valid_from),
 ADD CONSTRAINT road_segments_demo_check CHECK(NOT is_synthetic OR approval_status NOT IN ('approved','published'));

ALTER TABLE speed_limit_rules
 ADD COLUMN source_id uuid REFERENCES data_sources(id), ADD COLUMN is_synthetic boolean NOT NULL DEFAULT false,
 ADD COLUMN accuracy_meters double precision, ADD COLUMN confidence double precision,
 ADD COLUMN approved_by text, ADD COLUMN approved_at timestamptz,
 ADD CONSTRAINT speed_limit_rules_accuracy_check CHECK(accuracy_meters IS NULL OR (accuracy_meters>=0 AND accuracy_meters<'Infinity'::float8)),
 ADD CONSTRAINT speed_limit_rules_confidence_check CHECK(confidence BETWEEN 0 AND 1),
 ADD CONSTRAINT speed_limit_rules_demo_check CHECK(NOT is_synthetic OR status NOT IN ('approved','published'));
CREATE INDEX speed_limit_rules_segment_idx ON speed_limit_rules(road_segment_id);

INSERT INTO data_sources(kind,authority,title,reference,source_url,created_by,approval_status)
 SELECT 'official',source_authority,source_document,source_document,min(source_url),'legacy-migration','pending_review'
 FROM speed_limit_rules WHERE source_authority IS NOT NULL AND source_document IS NOT NULL
 GROUP BY source_authority,source_document;
UPDATE speed_limit_rules r SET source_id=s.id
 FROM data_sources s WHERE s.kind='official' AND s.authority=r.source_authority AND s.reference=r.source_document;
UPDATE speed_limit_rules SET status='pending_review' WHERE status IN ('approved','published');

CREATE TABLE enforcement_zones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), geometry geometry(Geometry,4326) NOT NULL,
 zone_type text NOT NULL CHECK(zone_type IN ('camera','checkpoint','restricted_area','other')),
 description text NOT NULL, source_id uuid REFERENCES data_sources(id), source_reference text,
 accuracy_meters double precision CHECK(accuracy_meters IS NULL OR (accuracy_meters>=0 AND accuracy_meters<'Infinity'::float8)),
 confidence double precision CHECK(confidence BETWEEN 0 AND 1), is_synthetic boolean NOT NULL DEFAULT false,
 approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending_review','approved','published','rejected','withdrawn')),
 valid_from timestamptz, expires_at timestamptz, created_by text NOT NULL, approved_by text, approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(rova_valid_wgs84(geometry) AND GeometryType(geometry) IN ('POLYGON','MULTIPOLYGON')),
 CHECK(expires_at IS NULL OR valid_from IS NULL OR expires_at>valid_from),
 CHECK(NOT is_synthetic OR approval_status NOT IN ('approved','published'))
);
CREATE INDEX enforcement_zones_geometry_idx ON enforcement_zones USING gist(geometry);
CREATE TABLE incident_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), geometry geometry(Point,4326) NOT NULL CHECK(rova_valid_wgs84(geometry)),
 incident_type text NOT NULL CHECK(incident_type IN ('collision','hazard','closure','flood','other')),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 2000),
 submitted_by_user uuid REFERENCES users(id) ON DELETE SET NULL, submitted_by_device uuid REFERENCES devices(id) ON DELETE SET NULL,
 source_id uuid REFERENCES data_sources(id), source_reference text,
 accuracy_meters double precision CHECK(accuracy_meters IS NULL OR (accuracy_meters>=0 AND accuracy_meters<'Infinity'::float8)),
 confidence double precision CHECK(confidence BETWEEN 0 AND 1), is_synthetic boolean NOT NULL DEFAULT false,
 approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending_review','approved','published','rejected','withdrawn')),
 observed_at timestamptz NOT NULL, valid_from timestamptz, expires_at timestamptz,
 created_by text NOT NULL, approved_by text, approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at IS NULL OR expires_at>observed_at),
 CHECK(expires_at IS NULL OR valid_from IS NULL OR expires_at>valid_from),
 CHECK(NOT is_synthetic OR approval_status NOT IN ('approved','published'))
);
CREATE INDEX incident_reports_geometry_idx ON incident_reports USING gist(geometry);
CREATE INDEX incident_reports_expiry_idx ON incident_reports(expires_at);
CREATE TABLE incident_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,
 device_id uuid NOT NULL REFERENCES devices(id), user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 decision text NOT NULL CHECK(decision IN ('confirm','deny','resolved')),
 accuracy_meters double precision CHECK(accuracy_meters IS NULL OR (accuracy_meters>=0 AND accuracy_meters<'Infinity'::float8)),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(incident_report_id,device_id)
);
ALTER TABLE audit_logs ADD COLUMN request_id uuid, ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object');
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type,entity_id,occurred_at);
CREATE TABLE moderation_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id text NOT NULL,
 entity_type text NOT NULL CHECK(entity_type IN ('data_source','road_segment','speed_limit_rule','enforcement_zone','incident_report')),
 entity_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('submit','approve','reject','withdraw','request_changes')),
 reason text NOT NULL CHECK(length(trim(reason))>0), audit_log_id bigint NOT NULL REFERENCES audit_logs(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_entity_idx ON moderation_actions(entity_type,entity_id,created_at);

CREATE FUNCTION guard_source_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.kind<>NEW.kind THEN RAISE EXCEPTION 'Source kind is immutable; create a new source' USING ERRCODE='23514'; END IF;
 IF OLD.approval_status IN ('approved','published') AND NEW.approval_status IN ('approved','published')
 AND (to_jsonb(OLD)-ARRAY['approval_status','approved_by','approved_at','is_synthetic']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['approval_status','approved_by','approved_at','is_synthetic'])
 THEN RAISE EXCEPTION 'Return source to review before editing approved content' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER data_sources_identity BEFORE UPDATE ON data_sources FOR EACH ROW EXECUTE FUNCTION guard_source_identity();

CREATE FUNCTION enforce_record_provenance() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE source_demo boolean; source_status text; segment_demo boolean; segment_status text; review_status text;
BEGIN
 SELECT is_synthetic,approval_status INTO source_demo,source_status FROM data_sources WHERE id=NEW.source_id;
 IF TG_OP='UPDATE' AND OLD.is_synthetic AND NOT NEW.is_synthetic THEN RAISE EXCEPTION 'Synthetic classification is permanent' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='speed_limit_rules' THEN
   SELECT is_synthetic,approval_status INTO segment_demo,segment_status FROM road_segments WHERE id=NEW.road_segment_id;
   review_status:=NEW.status;
 ELSE review_status:=NEW.approval_status; END IF;
 IF source_demo OR segment_demo THEN NEW.is_synthetic:=true; END IF;
 IF TG_OP='UPDATE' AND review_status IN ('approved','published')
 AND coalesce(to_jsonb(OLD)->>'approval_status',to_jsonb(OLD)->>'status') IN ('approved','published')
 AND (to_jsonb(OLD)-ARRAY['status','approval_status','approved_by','approved_at','verified_by','verified_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['status','approval_status','approved_by','approved_at','verified_by','verified_at'])
 THEN RAISE EXCEPTION 'Return record to review before editing approved content' USING ERRCODE='23514'; END IF;
 IF review_status IN ('approved','published') THEN
   IF NEW.is_synthetic OR NEW.source_id IS NULL OR source_status NOT IN ('approved','published')
     OR NEW.source_reference IS NULL OR length(trim(NEW.source_reference))=0 OR NEW.confidence IS NULL
     OR NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.approved_by=NEW.created_by
   THEN RAISE EXCEPTION 'Approval requires real reviewed provenance and independent reviewer metadata' USING ERRCODE='23514'; END IF;
   IF TG_TABLE_NAME='speed_limit_rules' AND segment_status NOT IN ('approved','published') THEN
     RAISE EXCEPTION 'Speed rule road segment must be approved' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['road_segments','speed_limit_rules','enforcement_zones','incident_reports'] LOOP
   EXECUTE format('CREATE TRIGGER provenance_guard BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_record_provenance()',target);
   EXECUTE format('CREATE INDEX %I ON %I(source_id)',target||'_source_idx',target);
 END LOOP;
END $$;
DROP TRIGGER speed_rules_require_independent_approvals ON speed_limit_rules;
CREATE TRIGGER speed_rules_require_independent_approvals BEFORE INSERT OR UPDATE ON speed_limit_rules
 FOR EACH ROW EXECUTE FUNCTION require_independent_speed_rule_approvals();

CREATE FUNCTION audit_record_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE row_data jsonb; BEGIN
 row_data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 INSERT INTO audit_logs(actor_id,entity_type,entity_id,action,reason,metadata)
 VALUES(coalesce(nullif(current_setting('rova.actor_id',true),''),current_user),TG_TABLE_NAME,(row_data->>'id')::uuid,lower(TG_OP),'Database record change',
 jsonb_build_object('status',coalesce(row_data->>'approval_status',row_data->>'status')));
 RETURN NULL;
END $$;
DO $$ DECLARE target text; BEGIN
 FOREACH target IN ARRAY ARRAY['data_sources','road_segments','speed_limit_rules','enforcement_zones','incident_reports','moderation_actions'] LOOP
   EXECUTE format('CREATE TRIGGER record_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_record_change()',target);
 END LOOP;
END $$;
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'Audit logs are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();

-- Legacy names remain readable. New writes, including ON CONFLICT imports, use physical tables.
CREATE VIEW speed_rules AS SELECT * FROM speed_limit_rules;
CREATE VIEW audit_events AS SELECT * FROM audit_logs;
CREATE VIEW published_road_segments AS
 SELECT r.* FROM road_segments r JOIN data_sources s ON s.id=r.source_id
 WHERE r.approval_status='published' AND NOT r.is_synthetic AND NOT s.is_synthetic AND s.approval_status IN ('approved','published')
 AND (r.valid_from IS NULL OR r.valid_from<=now()) AND (r.expires_at IS NULL OR r.expires_at>now())
 AND (s.valid_from IS NULL OR s.valid_from<=now()) AND (s.expires_at IS NULL OR s.expires_at>now());
CREATE VIEW published_speed_limit_rules AS
 SELECT r.* FROM speed_limit_rules r JOIN published_road_segments segment ON segment.id=r.road_segment_id JOIN data_sources s ON s.id=r.source_id
 WHERE r.status='published' AND NOT r.is_synthetic AND NOT s.is_synthetic AND s.approval_status IN ('approved','published')
 AND (r.effective_from IS NULL OR r.effective_from<=now()) AND (r.expires_at IS NULL OR r.expires_at>now())
 AND (s.valid_from IS NULL OR s.valid_from<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
 AND (SELECT count(DISTINCT a.reviewer_id) FROM speed_rule_approvals a WHERE a.speed_rule_id=r.id AND a.decision='approve' AND a.reviewer_id<>r.created_by)>=2;
CREATE VIEW published_enforcement_zones AS
 SELECT r.* FROM enforcement_zones r JOIN data_sources s ON s.id=r.source_id
 WHERE r.approval_status='published' AND NOT r.is_synthetic AND NOT s.is_synthetic AND s.approval_status IN ('approved','published')
 AND (r.valid_from IS NULL OR r.valid_from<=now()) AND (r.expires_at IS NULL OR r.expires_at>now()) AND (s.valid_from IS NULL OR s.valid_from<=now()) AND (s.expires_at IS NULL OR s.expires_at>now());
CREATE VIEW published_incident_reports AS
 SELECT r.* FROM incident_reports r JOIN data_sources s ON s.id=r.source_id
 WHERE r.approval_status='published' AND NOT r.is_synthetic AND NOT s.is_synthetic AND s.approval_status IN ('approved','published')
 AND r.expires_at>now() AND (r.valid_from IS NULL OR r.valid_from<=now()) AND (s.valid_from IS NULL OR s.valid_from<=now()) AND (s.expires_at IS NULL OR s.expires_at>now());
