-- F4 review workflow: status, comment, reviewed_at, reviewed_by on err_summary
-- Run in Supabase SQL Editor.

ALTER TABLE err_summary
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS review_comment text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

COMMENT ON COLUMN err_summary.review_status IS 'pending_review | accepted | rejected';
COMMENT ON COLUMN err_summary.review_comment IS 'Comment when rejected (returned to ERR/LoHub)';
COMMENT ON COLUMN err_summary.reviewed_at IS 'When status was set to accepted/rejected';
COMMENT ON COLUMN err_summary.reviewed_by IS 'User id from users table who set the review status';
