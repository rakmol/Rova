CREATE TABLE admin_members (
 issuer text NOT NULL, subject uuid NOT NULL, role text NOT NULL CHECK(role IN ('viewer','reviewer','editor','administrator')),
 active boolean NOT NULL DEFAULT true, granted_by text NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(issuer,subject)
);
CREATE TABLE admin_sessions (
 token_hash char(64) PRIMARY KEY, issuer text NOT NULL, subject uuid NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(issuer,subject) REFERENCES admin_members(issuer,subject)
);
CREATE TABLE admin_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity text NOT NULL CHECK(entity IN ('source','road','rule','zone','hazard')),
 entity_id uuid NOT NULL, sequence integer NOT NULL CHECK(sequence>0),
 author text NOT NULL, before_json jsonb, after_json jsonb NOT NULL,
 effective_at timestamptz, expires_at timestamptz, comment text NOT NULL CHECK(length(trim(comment)) BETWEEN 10 AND 2000),
 reverted_from uuid REFERENCES admin_revisions(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(entity,entity_id,sequence)
);
CREATE TABLE admin_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), revision_id uuid NOT NULL REFERENCES admin_revisions(id), reviewer text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approve','reject')), comment text NOT NULL CHECK(length(trim(comment)) BETWEEN 10 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(revision_id,reviewer)
);
CREATE TABLE admin_action_logs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor text NOT NULL, action text NOT NULL, entity text NOT NULL, entity_id text,
 before_json jsonb, after_json jsonb, comment text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_action_time ON admin_action_logs(created_at DESC);
CREATE INDEX admin_revision_entity ON admin_revisions(entity,entity_id,sequence DESC);
DO $$ DECLARE target text; BEGIN FOREACH target IN ARRAY ARRAY['data_sources','road_segments','speed_limit_rules','enforcement_zones','incident_reports'] LOOP
 EXECUTE format('ALTER TABLE %I ADD COLUMN admin_revision_seq integer NOT NULL DEFAULT 0 CHECK(admin_revision_seq>=0)',target);
END LOOP; END $$;
-- Snapshot only content, never reporter identity or publication stamps. Geometry is WGS84 GeoJSON.
CREATE FUNCTION admin_content(row_data jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb; BEGIN
 result:=row_data-ARRAY['submitted_by_user','submitted_by_device','approval_status','status','community_status','approved_by','approved_at','verified_by','verified_at','last_reviewed_at','updated_at'];
 -- Stored generated columns are not populated in BEFORE triggers.
 IF row_data ? 'kind' AND row_data ? 'is_synthetic' THEN result:=jsonb_set(result,'{is_synthetic}',to_jsonb(row_data->>'kind'='synthetic')); END IF;
 IF row_data ? 'community_status' THEN result:=result-ARRAY['confidence','revision']; END IF;
 IF row_data ? 'geometry' THEN result:=jsonb_set(result,'{geometry}',ST_AsGeoJSON((row_data->>'geometry')::geometry)::jsonb); END IF;
 RETURN result;
END $$;
CREATE FUNCTION guard_admin_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE record jsonb; entity_name text; published boolean; revision admin_revisions; needed integer; BEGIN
 IF NEW.admin_revision_seq=0 THEN RETURN NEW; END IF;
 record:=to_jsonb(NEW);
 entity_name:=CASE TG_TABLE_NAME WHEN 'data_sources' THEN 'source' WHEN 'road_segments' THEN 'road' WHEN 'speed_limit_rules' THEN 'rule' WHEN 'enforcement_zones' THEN 'zone' ELSE 'hazard' END;
 published:=CASE WHEN entity_name='hazard' THEN record->>'community_status'='verified' ELSE coalesce(record->>'status',record->>'approval_status') IN ('approved','published') END;
 IF NOT coalesce(published,false) THEN RETURN NEW; END IF;
 needed:=CASE WHEN entity_name='hazard' THEN 1 ELSE 2 END;
 SELECT * INTO revision FROM admin_revisions WHERE entity=entity_name AND entity_id=NEW.id AND sequence=NEW.admin_revision_seq;
 IF revision.id IS NULL OR revision.after_json IS DISTINCT FROM admin_content(record)
 OR EXISTS(SELECT 1 FROM admin_reviews WHERE revision_id=revision.id AND decision='reject')
 OR (SELECT count(DISTINCT reviewer) FROM admin_reviews WHERE revision_id=revision.id AND decision='approve' AND reviewer<>revision.author AND reviewer<>(record->>'created_by') AND created_at>now()-interval '180 days') < needed
 THEN RAISE EXCEPTION 'Publication requires matching current content and independent approved reviews' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE target text; BEGIN FOREACH target IN ARRAY ARRAY['data_sources','road_segments','speed_limit_rules','enforcement_zones','incident_reports'] LOOP
 EXECUTE format('CREATE TRIGGER z_admin_publication BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION guard_admin_publication()',target);
END LOOP; END $$;
DO $$ DECLARE target text; BEGIN FOREACH target IN ARRAY ARRAY['admin_revisions','admin_reviews','admin_action_logs'] LOOP
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation()',target);
 EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation()',target);
END LOOP; END $$;
CREATE TABLE coverage_daily (
 day date NOT NULL DEFAULT current_date, cell_lon numeric NOT NULL, cell_lat numeric NOT NULL, reason text NOT NULL,
 samples integer NOT NULL DEFAULT 1 CHECK(samples BETWEEN 1 AND 1000000), PRIMARY KEY(day,cell_lon,cell_lat,reason)
);
REVOKE ALL ON admin_members,admin_sessions,admin_revisions,admin_reviews,admin_action_logs,coverage_daily FROM PUBLIC;
