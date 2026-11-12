CREATE TABLE notification_installations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_id uuid NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
 auth_hash char(64) NOT NULL UNIQUE, auth_expires_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT false, closures boolean NOT NULL DEFAULT false, policy boolean NOT NULL DEFAULT false,
 marketing boolean NOT NULL DEFAULT false CHECK(NOT marketing), current_trip boolean NOT NULL DEFAULT false CHECK(NOT current_trip),
 time_zone text NOT NULL DEFAULT 'Africa/Accra' CHECK(time_zone='Africa/Accra'), daily_cap integer NOT NULL DEFAULT 2 CHECK(daily_cap BETWEEN 1 AND 2),
 permission text NOT NULL DEFAULT 'unknown' CHECK(permission IN ('unknown','granted','denied','undeliverable')),
 consented_at timestamptz, lease_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT enabled OR (permission='granted' AND consented_at IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE TABLE notification_regions (
 installation_id uuid NOT NULL REFERENCES notification_installations(id) ON DELETE CASCADE, id text NOT NULL CHECK(length(id) BETWEEN 1 AND 100),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80), geometry geometry(Point,4326) NOT NULL,
 PRIMARY KEY(installation_id,id), CHECK(rova_valid_wgs84(geometry)),
 CHECK(ST_X(geometry) BETWEEN -4 AND 2 AND ST_Y(geometry) BETWEEN 4 AND 12),
 CHECK(abs(ST_X(geometry)*50-round(ST_X(geometry)*50))<.000001 AND abs(ST_Y(geometry)*50-round(ST_Y(geometry)*50))<.000001)
);
CREATE INDEX notification_region_geo ON notification_regions USING gist((geometry::geography));
CREATE TABLE policy_announcements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 2000), source_id uuid NOT NULL REFERENCES data_sources(id),
 source_reference text NOT NULL CHECK(length(trim(source_reference))>0), source_url text NOT NULL CHECK(source_url ~ '^https://'),
 valid_from timestamptz NOT NULL, expires_at timestamptz NOT NULL CHECK(expires_at>valid_from),
 approval_status text NOT NULL DEFAULT 'draft' CHECK(approval_status IN ('draft','pending_review','published','rejected','withdrawn')),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 approved_by text, approved_at timestamptz, admin_revision_seq integer NOT NULL DEFAULT 0 CHECK(admin_revision_seq>=0)
);
ALTER TABLE admin_revisions DROP CONSTRAINT admin_revisions_entity_check;
ALTER TABLE admin_revisions ADD CONSTRAINT admin_revisions_entity_check CHECK(entity IN ('source','road','rule','zone','hazard','policy'));
CREATE FUNCTION guard_policy_publication() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE revision admin_revisions; source data_sources; BEGIN
 IF NEW.approval_status<>'published' THEN RETURN NEW; END IF;
 SELECT * INTO source FROM data_sources WHERE id=NEW.source_id;
 SELECT * INTO revision FROM admin_revisions WHERE entity='policy' AND entity_id=NEW.id AND sequence=NEW.admin_revision_seq;
 IF revision.id IS NULL OR NEW.admin_revision_seq=0 OR revision.after_json IS DISTINCT FROM admin_content(to_jsonb(NEW))
 OR source.kind<>'official' OR source.is_synthetic OR source.approval_status NOT IN ('approved','published')
 OR source.valid_from IS NULL OR source.valid_from>now() OR source.expires_at IS NULL OR source.expires_at<=now()
 OR source.approved_at IS NULL OR source.approved_at<now()-interval '180 days' OR source.source_url IS NULL
 OR EXISTS(SELECT 1 FROM admin_reviews WHERE revision_id=revision.id AND decision='reject')
 OR (SELECT count(DISTINCT reviewer) FROM admin_reviews WHERE revision_id=revision.id AND decision='approve' AND reviewer<>revision.author AND reviewer<>NEW.created_by AND created_at>now()-interval '180 days')<2
 THEN RAISE EXCEPTION 'Policy publication needs current official provenance and two independent reviews' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER policy_review_guard BEFORE INSERT OR UPDATE ON policy_announcements FOR EACH ROW EXECUTE FUNCTION guard_policy_publication();
CREATE TRIGGER policy_record_audit AFTER INSERT OR UPDATE OR DELETE ON policy_announcements FOR EACH ROW EXECUTE FUNCTION audit_record_change();
CREATE VIEW current_policy_announcements AS SELECT p.* FROM policy_announcements p JOIN data_sources s ON s.id=p.source_id
 JOIN admin_revisions r ON r.entity='policy' AND r.entity_id=p.id AND r.sequence=p.admin_revision_seq AND r.after_json=admin_content(to_jsonb(p))
 WHERE p.approval_status='published' AND p.valid_from<=now() AND p.expires_at>now() AND p.approved_at>now()-interval '180 days'
 AND s.kind='official' AND NOT s.is_synthetic AND s.approval_status IN ('approved','published') AND s.valid_from<=now() AND s.expires_at>now() AND s.approved_at>now()-interval '180 days'
 AND NOT EXISTS(SELECT 1 FROM admin_reviews WHERE revision_id=r.id AND decision='reject')
 AND (SELECT count(DISTINCT reviewer) FROM admin_reviews WHERE revision_id=r.id AND decision='approve' AND reviewer<>r.author AND reviewer<>p.created_by AND created_at>now()-interval '180 days')>=2;
CREATE TABLE notification_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), installation_id uuid NOT NULL REFERENCES notification_installations(id) ON DELETE CASCADE,
 event_key text NOT NULL, kind text NOT NULL CHECK(kind IN ('closure','policy')), source_id uuid NOT NULL, source_revision integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','accepted','confirmed','dead','skipped','unknown')),
 available_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0,
 claimed_at timestamptz, ticket_id text, receipt_checked_at timestamptz, accepted_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(installation_id,event_key)
);
CREATE INDEX notification_queue_pending ON notification_queue(available_at) WHERE status='pending';
CREATE TABLE notification_reservations (
 queue_id uuid PRIMARY KEY,
 token_fingerprint char(64) NOT NULL,
 installation_id uuid REFERENCES notification_installations(id) ON DELETE SET NULL, reserved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_frequency ON notification_reservations(token_fingerprint,reserved_at DESC);
REVOKE ALL ON notification_installations,notification_regions,policy_announcements,current_policy_announcements,notification_queue,notification_reservations FROM PUBLIC;
