CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE road_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geometry geometry(LineString, 4326) NOT NULL,
  direction text NOT NULL CHECK (direction IN ('forward', 'reverse', 'both')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX road_segments_geometry_idx
  ON road_segments USING gist (geometry);

CREATE TABLE speed_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  road_segment_id uuid NOT NULL REFERENCES road_segments(id),
  vehicle_class text NOT NULL,
  speed_limit_kmh integer CHECK (speed_limit_kmh BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('draft', 'reviewed', 'published', 'withdrawn')),
  evidence_reference text,
  created_by text NOT NULL,
  verified_by text,
  verified_at timestamptz,
  effective_from timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR effective_from IS NULL OR expires_at > effective_from),
  CHECK (
    status <> 'published'
    OR (
      speed_limit_kmh IS NOT NULL
      AND evidence_reference IS NOT NULL
      AND verified_at IS NOT NULL
      AND verified_by IS NOT NULL
      AND verified_by <> created_by
    )
  )
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
