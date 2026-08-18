-- Data Archive feature: record when a project was marked completed.
-- Run in Supabase SQL Editor.

ALTER TABLE err_projects
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN err_projects.completed_at IS 'When status was set to completed (used by Data Archive exports). NULL for legacy completions until amended.';

-- Backfill from the existing report-completion date for projects already marked completed.
UPDATE err_projects
SET completed_at = (date_report_completed::timestamptz)
WHERE status = 'completed'
  AND completed_at IS NULL
  AND date_report_completed IS NOT NULL;
