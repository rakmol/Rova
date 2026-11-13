-- Suggestions are a review inbox, never an authority safety dataset.
CREATE TABLE community_contributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 device_id uuid REFERENCES devices(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('place','fixed_camera')),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
 category text NOT NULL CHECK(category IN ('landmark','market','business','junction','other','fixed_speed','red_light','unknown')),
 geometry geometry(Point,4326) NOT NULL,
 note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 direction text NOT NULL DEFAULT '' CHECK(length(direction)<=120),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','rejected')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '90 days',
 reviewed_at timestamptz,
 CHECK(ST_X(geometry) BETWEEN -4 AND 2 AND ST_Y(geometry) BETWEEN 4 AND 12),
 CHECK((kind='place' AND category IN ('landmark','market','business','junction','other')) OR
       (kind='fixed_camera' AND category IN ('fixed_speed','red_light','unknown')))
);
CREATE INDEX contribution_review_queue ON community_contributions(status,created_at DESC);
CREATE INDEX contribution_device ON community_contributions(device_id,created_at DESC);
CREATE INDEX contribution_location ON community_contributions USING gist((geometry::geography));
ALTER TABLE community_contributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON community_contributions FROM PUBLIC;
-- Supabase browser/driver roles have no direct access; only the authenticated API.
DO $$ DECLARE role_name text; BEGIN FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON community_contributions FROM %I',role_name); END IF;
END LOOP; END $$;
