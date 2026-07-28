-- Data Archive feature: record when a project was marked completed.
-- Run in Supabase SQL Editor.

ALTER TABLE err_projects
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN err_projects.completed_at IS 'When status was set to completed (used by Data Archive exports). NULL for legacy completions until amended.';
