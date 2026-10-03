-- Operational agreement: portal compliance screening starts 2026-07-01.
-- F1s raised before that are tagged committed_without_clearance (NOT cleared)
-- and must not appear in the Screening queue.
-- Run in Supabase SQL Editor before or with the corresponding app deploy.

ALTER TABLE compliance_screenings
  DROP CONSTRAINT IF EXISTS compliance_screenings_status_check;

ALTER TABLE compliance_screenings
  ADD CONSTRAINT compliance_screenings_status_check
  CHECK (status IN (
    'pending_screening',
    'cleared',
    'flagged',
    'auto_approved',
    'committed_without_clearance'
  ));

COMMENT ON CONSTRAINT compliance_screenings_status_check ON compliance_screenings IS
  'committed_without_clearance = raised before 2026-07-01; excluded from Screening; not a Clear.';
