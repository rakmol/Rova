-- First-party, opt-in diagnostic contributions. No coordinates, trips, device/account IDs,
-- message/stack content, IP addresses or precise event times are accepted here.
CREATE FUNCTION pilot_counts_valid(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item record; total numeric:=0;
BEGIN
 IF jsonb_typeof(value)<>'object' THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_each(value) LOOP
  IF item.key<>ALL(ARRAY['sessions','android_supported_sessions','android_unsupported_sessions','android_history_gaps','android_crashes','android_native_crashes','android_anrs','js_fatal','nav_attempts','nav_failures','nav_arrivals','nav_cancelled','reroute_failures','gps_good','gps_poor','gps_stale','speed_verified','speed_unknown','safety_stale']) OR jsonb_typeof(item.value)<>'number' THEN RETURN false; END IF;
  IF (item.value::text)::numeric<0 OR (item.value::text)::numeric>10000 OR trunc((item.value::text)::numeric)<>(item.value::text)::numeric THEN RETURN false; END IF;
  total:=total+(item.value::text)::numeric;
 END LOOP;
 RETURN total<=10000;
END $$;
CREATE TABLE pilot_telemetry_sessions(token_hash text PRIMARY KEY CHECK(token_hash~'^[a-f0-9]{64}$'),consent_version integer NOT NULL CHECK(consent_version=1),created_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,expires_at timestamptz NOT NULL,revoked boolean NOT NULL DEFAULT false);
CREATE TABLE pilot_telemetry_batches(token_hash text NOT NULL REFERENCES pilot_telemetry_sessions(token_hash) ON DELETE CASCADE,batch_id uuid NOT NULL,day date NOT NULL,received_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,app_version text NOT NULL CHECK(app_version~'^([0-9]+\.[0-9]+\.[0-9]+|unknown)$' AND length(app_version)<=32),build_code text NOT NULL CHECK(build_code~'^([0-9]{1,10}|unknown)$'),variant text NOT NULL CHECK(variant IN ('development','preview','production','unknown')),counts jsonb NOT NULL CHECK(pilot_counts_valid(counts)),PRIMARY KEY(token_hash,batch_id));
CREATE INDEX pilot_batches_day_idx ON pilot_telemetry_batches(day);
CREATE TABLE pilot_corridors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(name) BETWEEN 3 AND 120),segment_ids uuid[] NOT NULL CHECK(cardinality(segment_ids) BETWEEN 1 AND 64),evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 10 AND 1000),stage text NOT NULL CHECK(stage IN ('passenger','limited')),status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused')),revision integer NOT NULL DEFAULT 1,author text NOT NULL,valid_from timestamptz NOT NULL,expires_at timestamptz NOT NULL CHECK(expires_at>valid_from AND expires_at<=valid_from+interval '30 days'));
CREATE TABLE pilot_corridor_reviews(corridor_id uuid NOT NULL REFERENCES pilot_corridors(id),revision integer NOT NULL,reviewer text NOT NULL,decision text NOT NULL CHECK(decision IN ('approve','reject')),comment text NOT NULL CHECK(length(comment) BETWEEN 10 AND 2000),reviewed_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(corridor_id,revision,reviewer));
CREATE FUNCTION pilot_members_current(ids uuid[]) RETURNS boolean LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT cardinality(ids)>0 AND NOT EXISTS(SELECT 1 FROM unnest(ids) member WHERE NOT EXISTS(
  SELECT 1 FROM published_road_segments road JOIN road_segments detail ON detail.id=road.id WHERE road.id=member AND road.confidence>=.9 AND road.accuracy_meters<=10 AND detail.road_kind<>'unknown'
  AND ST_CoveredBy(road.geometry,ST_MakeEnvelope(-.5,5.4,.35,6.1,4326))
  AND EXISTS(SELECT 1 FROM published_speed_limit_rules rule JOIN data_sources source ON source.id=rule.source_id WHERE rule.road_segment_id=road.id AND rule.units='km/h' AND rule.confidence>=.9 AND rule.last_reviewed_at>=now()-interval '180 days' AND source.kind IN ('official','field_audit') AND source.published_at>=now()-interval '365 days')
 ));
$$;
CREATE VIEW current_pilot_corridors AS SELECT c.* FROM pilot_corridors c WHERE c.status='active' AND c.valid_from<=now() AND c.expires_at>now() AND pilot_members_current(c.segment_ids)
 AND (SELECT count(*) FROM pilot_corridor_reviews r WHERE r.corridor_id=c.id AND r.revision=c.revision AND r.decision='approve' AND r.reviewer<>c.author AND r.reviewed_at>=now()-interval '7 days')>=2
 AND NOT EXISTS(SELECT 1 FROM pilot_corridor_reviews r WHERE r.corridor_id=c.id AND r.revision=c.revision AND r.decision='reject');
CREATE FUNCTION guard_pilot_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pilot_corridors WHERE id=NEW.corridor_id AND revision=NEW.revision AND author<>NEW.reviewer) THEN RAISE EXCEPTION 'Pilot review must be independent and current'; END IF;RETURN NEW;END $$;
CREATE TRIGGER pilot_review_independence BEFORE INSERT ON pilot_corridor_reviews FOR EACH ROW EXECUTE FUNCTION guard_pilot_review();
CREATE FUNCTION pilot_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Pilot review history is immutable'; END $$;
CREATE TRIGGER pilot_review_append_only BEFORE UPDATE OR DELETE ON pilot_corridor_reviews FOR EACH ROW EXECUTE FUNCTION pilot_review_immutable();
CREATE FUNCTION guard_pilot_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.name,NEW.segment_ids,NEW.evidence_reference,NEW.stage,NEW.valid_from,NEW.expires_at) IS DISTINCT FROM (OLD.name,OLD.segment_ids,OLD.evidence_reference,OLD.stage,OLD.valid_from,OLD.expires_at) THEN NEW.revision:=OLD.revision+1;NEW.status:='draft';NEW.author:=coalesce(nullif(current_setting('rova.actor_id',true),''),NEW.author);END IF;
 IF NEW.status='active' AND (NEW.valid_from>now() OR NEW.expires_at<=now() OR NOT pilot_members_current(NEW.segment_ids) OR (SELECT count(*) FROM pilot_corridor_reviews WHERE corridor_id=NEW.id AND revision=NEW.revision AND decision='approve' AND reviewer<>NEW.author AND reviewed_at>=now()-interval '7 days')<2 OR EXISTS(SELECT 1 FROM pilot_corridor_reviews WHERE corridor_id=NEW.id AND revision=NEW.revision AND decision='reject')) THEN RAISE EXCEPTION 'Pilot corridor requires current independent verification';END IF;RETURN NEW;END $$;
CREATE TRIGGER pilot_activation BEFORE INSERT OR UPDATE ON pilot_corridors FOR EACH ROW EXECUTE FUNCTION guard_pilot_activation();
CREATE TABLE pilot_incident_checks(report_id uuid NOT NULL REFERENCES incident_reports(id) ON DELETE CASCADE,revision integer NOT NULL,reviewer text NOT NULL,judgment text NOT NULL CHECK(judgment IN ('confirmed','false','uncertain')),evidence_reference text NOT NULL CHECK(length(evidence_reference) BETWEEN 10 AND 1000),checked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(report_id,revision,reviewer));
CREATE TRIGGER pilot_incident_check_immutable BEFORE UPDATE ON pilot_incident_checks FOR EACH ROW EXECUTE FUNCTION pilot_review_immutable();
ALTER TABLE pilot_telemetry_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_telemetry_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_corridors ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_corridor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_incident_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pilot_telemetry_sessions,pilot_telemetry_batches,pilot_corridors,pilot_corridor_reviews,pilot_incident_checks,current_pilot_corridors FROM PUBLIC;
