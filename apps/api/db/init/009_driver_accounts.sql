CREATE TABLE driver_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 voice_enabled boolean NOT NULL DEFAULT true,
 voice_language text NOT NULL DEFAULT 'en-GH' CHECK(voice_language IN ('en-GH','en-GB','en-US')),
 units text NOT NULL DEFAULT 'metric' CHECK(units IN ('metric','imperial')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE driver_saved_places (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 client_key text NOT NULL CHECK(length(client_key) BETWEEN 1 AND 100),
 kind text NOT NULL CHECK(kind IN ('home','work','favorite')),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 address text NOT NULL CHECK(length(address)<=300), attribution text NOT NULL CHECK(length(attribution)<=500),
 geometry geometry(Point,4326) NOT NULL CHECK(rova_valid_wgs84(geometry)),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,client_key)
);
CREATE UNIQUE INDEX driver_one_home_work ON driver_saved_places(user_id,kind) WHERE kind IN ('home','work');
CREATE INDEX driver_places_owner ON driver_saved_places(user_id);
CREATE TABLE driver_deletion_jobs (
 user_id uuid PRIMARY KEY REFERENCES users(id), provider_subject uuid NOT NULL, provider_issuer text NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(), next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0, completed_at timestamptz
);
ALTER TABLE driver_saved_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_preferences ENABLE ROW LEVEL SECURITY;
-- No client SQL grants/policies. The API checks managed-provider identity and scopes every query.
REVOKE ALL ON driver_saved_places,driver_preferences,driver_deletion_jobs FROM PUBLIC;
