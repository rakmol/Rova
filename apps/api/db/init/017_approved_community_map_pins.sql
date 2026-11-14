-- Explicit display approval only: never promote a community observation to an authority safety rule.
ALTER TABLE community_contributions DROP CONSTRAINT community_contributions_status_check;
ALTER TABLE community_contributions ADD CONSTRAINT community_contributions_status_check
 CHECK(status IN ('pending','reviewed','approved','rejected'));
ALTER TABLE community_contributions ADD COLUMN published_at timestamptz;
ALTER TABLE community_contributions ADD CONSTRAINT contribution_display_approval
 CHECK((status='approved')=(published_at IS NOT NULL));
-- Previously reviewed suggestions stay unpublished until explicitly approved.
