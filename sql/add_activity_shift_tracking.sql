-- Track F1→F5 activity/sector shifts without mutating F1 planned_activities/expenses.
-- Run in Supabase SQL Editor (or applied via MCP migration add_activity_shift_tracking).

ALTER TABLE err_program_reach
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN err_program_reach.category IS 'Implemented sector/category for this F5 activity (same vocabulary as planned_activities.category). Does not alter F1.';

ALTER TABLE err_projects
  ADD COLUMN IF NOT EXISTS implemented_sector text,
  ADD COLUMN IF NOT EXISTS activity_shift_note text,
  ADD COLUMN IF NOT EXISTS activity_shift_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activity_shift_updated_by uuid;

COMMENT ON COLUMN err_projects.implemented_sector IS 'Primary implemented sector after F5 / manual override. Separate from F1 planned_activities.';
COMMENT ON COLUMN err_projects.activity_shift_note IS 'Optional note explaining why implemented sector differs from F1 plan.';
COMMENT ON COLUMN err_projects.activity_shift_updated_at IS 'When implemented_sector or activity_shift_note was last set.';
COMMENT ON COLUMN err_projects.activity_shift_updated_by IS 'Auth user who last updated implemented sector/note.';
