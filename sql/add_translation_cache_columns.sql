-- Add cached EN translation columns for AR content (used by Mutual Aid Learnings to avoid repeated Google Translate API calls).
-- Run this migration against your Supabase/Postgres database.

-- err_program_report: cache English translation of narrative fields when language = 'ar'
ALTER TABLE public.err_program_report
  ADD COLUMN IF NOT EXISTS positive_changes_en text NULL,
  ADD COLUMN IF NOT EXISTS negative_results_en text NULL,
  ADD COLUMN IF NOT EXISTS unexpected_results_en text NULL,
  ADD COLUMN IF NOT EXISTS lessons_learned_en text NULL,
  ADD COLUMN IF NOT EXISTS suggestions_en text NULL;

COMMENT ON COLUMN public.err_program_report.positive_changes_en IS 'Cached English translation of positive_changes when language is ar';
COMMENT ON COLUMN public.err_program_report.negative_results_en IS 'Cached English translation of negative_results when language is ar';
COMMENT ON COLUMN public.err_program_report.unexpected_results_en IS 'Cached English translation of unexpected_results when language is ar';
COMMENT ON COLUMN public.err_program_report.lessons_learned_en IS 'Cached English translation of lessons_learned when language is ar';
COMMENT ON COLUMN public.err_program_report.suggestions_en IS 'Cached English translation of suggestions when language is ar';

-- err_program_reach: cache English translation of location/activity/goal when source is AR
ALTER TABLE public.err_program_reach
  ADD COLUMN IF NOT EXISTS location_en text NULL,
  ADD COLUMN IF NOT EXISTS activity_name_en text NULL,
  ADD COLUMN IF NOT EXISTS activity_goal_en text NULL;

COMMENT ON COLUMN public.err_program_reach.location_en IS 'Cached English translation of location when language is ar';
COMMENT ON COLUMN public.err_program_reach.activity_name_en IS 'Cached English translation of activity_name when language is ar';
COMMENT ON COLUMN public.err_program_reach.activity_goal_en IS 'Cached English translation of activity_goal when language is ar';
