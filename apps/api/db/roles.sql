-- Optional operator-run least-privilege read role. No login or passwords are created.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rova_reader') THEN CREATE ROLE rova_reader NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA public TO rova_reader;
GRANT SELECT ON schema_migrations,published_road_segments,published_speed_limit_rules,published_enforcement_zones,published_incident_reports TO rova_reader;
GRANT EXECUTE ON FUNCTION rova_speed_limit_candidates(double precision,double precision,double precision,text) TO rova_reader;
GRANT EXECUTE ON FUNCTION rova_compliance_candidates(double precision,double precision,uuid) TO rova_reader;
GRANT EXECUTE ON FUNCTION rova_reported_road_candidates(double precision,double precision) TO rova_reader;
-- Grant this role to a separately managed production login. Do not grant raw
-- safety-table writes or database ownership to the public read API identity.

-- Optional incident service role. Does not grant official-road/source writes.
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rova_incident_writer') THEN CREATE ROLE rova_incident_writer NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA public TO rova_incident_writer;
GRANT SELECT,INSERT,UPDATE ON devices,incident_reports TO rova_incident_writer;
GRANT DELETE ON devices TO rova_incident_writer;
GRANT SELECT,INSERT,DELETE ON incident_confirmations,incident_sessions TO rova_incident_writer;
GRANT SELECT,INSERT,UPDATE,DELETE ON incident_abuse_buckets TO rova_incident_writer;
GRANT SELECT ON community_incident_summary TO rova_incident_writer;
GRANT SELECT,INSERT ON audit_logs,moderation_actions TO rova_incident_writer;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SEQUENCE %s TO rova_incident_writer',pg_get_serial_sequence('audit_logs','id')); END $$;
