-- Record when an F1's funding_status was set to committed (F2).
-- Run in Supabase SQL Editor (or apply via schema repo / migrations).

ALTER TABLE err_projects
  ADD COLUMN IF NOT EXISTS committed_at timestamptz;

COMMENT ON COLUMN err_projects.committed_at IS
  'When funding_status was set to committed at F2. NULL for legacy commits until re-committed or backfilled.';

CREATE INDEX IF NOT EXISTS idx_err_projects_committed_at
  ON err_projects (committed_at DESC)
  WHERE committed_at IS NOT NULL;

-- Best-effort backfill for workplan-path commits that wrote a ledger row.
-- Uncommitted/commit path never wrote ledger rows, so those stay NULL.
UPDATE err_projects ep
SET committed_at = sub.first_committed_at
FROM (
  SELECT
    workplan_id,
    MIN(created_at) AS first_committed_at
  FROM grant_project_commitment_ledger
  GROUP BY workplan_id
) sub
WHERE ep.id = sub.workplan_id
  AND ep.funding_status = 'committed'
  AND ep.committed_at IS NULL;
