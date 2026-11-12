CREATE TABLE IF NOT EXISTS official_speed_rule_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_authority text NOT NULL,
  source_document text NOT NULL,
  source_file_name text NOT NULL,
  source_file_sha256 char(64) NOT NULL,
  imported_by text NOT NULL,
  row_count integer NOT NULL CHECK (row_count > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE road_segments
  ADD COLUMN IF NOT EXISTS road_name text;

ALTER TABLE speed_rules
  DROP CONSTRAINT IF EXISTS speed_rules_status_check;

UPDATE speed_rules
SET status = 'pending_review'
WHERE status = 'reviewed';

ALTER TABLE speed_rules
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'both',
  ADD COLUMN IF NOT EXISTS source_authority text,
  ADD COLUMN IF NOT EXISTS source_document text,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_fingerprint char(64),
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES official_speed_rule_imports(id);

CREATE TABLE IF NOT EXISTS speed_rule_approvals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  speed_rule_id uuid NOT NULL REFERENCES speed_rules(id),
  reviewer_id text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (speed_rule_id, reviewer_id)
);

-- Keep legacy publications out of driver-facing data until they meet the new provenance and review policy.
UPDATE speed_rules r
SET status = 'pending_review'
WHERE r.status IN ('approved', 'published')
  AND (
    r.source_authority IS NULL
    OR r.source_document IS NULL
    OR r.source_reference IS NULL
    OR r.verified_by IS NULL
    OR r.verified_at IS NULL
    OR r.verified_by = r.created_by
    OR NOT EXISTS (
      SELECT 1
      FROM speed_rule_approvals a
      WHERE a.speed_rule_id = r.id
        AND a.decision = 'approve'
        AND a.reviewer_id <> r.created_by
      GROUP BY a.speed_rule_id
      HAVING count(DISTINCT a.reviewer_id) >= 2
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'speed_rules_status_check'
  ) THEN
    ALTER TABLE speed_rules
      ADD CONSTRAINT speed_rules_status_check
      CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'rejected', 'withdrawn'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'speed_rules_direction_check'
  ) THEN
    ALTER TABLE speed_rules
      ADD CONSTRAINT speed_rules_direction_check
      CHECK (direction IN ('forward', 'reverse', 'both'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'speed_rules_published_evidence_check'
  ) THEN
    ALTER TABLE speed_rules
      ADD CONSTRAINT speed_rules_published_evidence_check
      CHECK (
        status NOT IN ('approved', 'published')
        OR (
          speed_limit_kmh IS NOT NULL
          AND evidence_reference IS NOT NULL
          AND source_authority IS NOT NULL
          AND source_document IS NOT NULL
          AND source_reference IS NOT NULL
          AND verified_by IS NOT NULL
          AND verified_at IS NOT NULL
          AND verified_by <> created_by
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS speed_rules_source_fingerprint_idx
  ON speed_rules (source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS speed_rules_review_queue_idx
  ON speed_rules (status, created_at)
  WHERE status IN ('draft', 'pending_review');

CREATE OR REPLACE FUNCTION require_independent_speed_rule_approvals()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  approval_count integer;
BEGIN
  IF NEW.status IN ('approved', 'published') THEN
    SELECT count(DISTINCT reviewer_id)
    INTO approval_count
    FROM speed_rule_approvals
    WHERE speed_rule_id = NEW.id
      AND decision = 'approve'
      AND reviewer_id <> NEW.created_by;

    IF approval_count < 2 THEN
      RAISE EXCEPTION 'A speed rule requires two independent approvals before publication'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS speed_rules_require_independent_approvals ON speed_rules;

CREATE TRIGGER speed_rules_require_independent_approvals
  BEFORE INSERT OR UPDATE OF status ON speed_rules
  FOR EACH ROW
  EXECUTE FUNCTION require_independent_speed_rule_approvals();
