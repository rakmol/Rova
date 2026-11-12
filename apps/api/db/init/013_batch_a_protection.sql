ALTER TABLE driver_saved_places ADD COLUMN storage_proof text CHECK(storage_proof IS NULL OR length(storage_proof)<=1024);
CREATE TABLE provider_usage (
 scope text NOT NULL, provider text NOT NULL CHECK(provider IN ('geoapify','mapbox')), meter text NOT NULL CHECK(meter IN ('search','routing','attempts')),
 period text NOT NULL CHECK(period IN ('day','month')), starts date NOT NULL, reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0),
 PRIMARY KEY(scope,provider,meter,period,starts)
);
CREATE TABLE provider_usage_state (
 scope text NOT NULL, provider text NOT NULL CHECK(provider IN ('geoapify','mapbox')), month date NOT NULL,
 limits jsonb NOT NULL, recent_calls timestamptz[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(scope,provider,month),CHECK(cardinality(recent_calls)<=30)
);
ALTER TABLE provider_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_usage_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON provider_usage,provider_usage_state FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON provider_usage,provider_usage_state FROM %I',role_name); END IF;
END LOOP; END $$;
