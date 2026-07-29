-- Store login email (not users.id UUID) on compliance actor columns so the
-- table is readable in Supabase / exports without joining auth.users.
-- Backfills existing UUID values from public.users → auth.users.email.

ALTER TABLE compliance_screenings
  DROP CONSTRAINT IF EXISTS compliance_screenings_screened_by_fkey;

ALTER TABLE compliance_screenings
  DROP CONSTRAINT IF EXISTS compliance_screenings_finance_reviewed_by_fkey;

ALTER TABLE compliance_screenings
  ADD COLUMN IF NOT EXISTS screened_by_login TEXT;

ALTER TABLE compliance_screenings
  ADD COLUMN IF NOT EXISTS finance_reviewed_by_login TEXT;

UPDATE compliance_screenings cs
SET screened_by_login = au.email
FROM users u
JOIN auth.users au ON au.id = u.auth_user_id
WHERE cs.screened_by IS NOT NULL
  AND cs.screened_by::text = u.id::text
  AND cs.screened_by_login IS NULL;

UPDATE compliance_screenings cs
SET finance_reviewed_by_login = au.email
FROM users u
JOIN auth.users au ON au.id = u.auth_user_id
WHERE cs.finance_reviewed_by IS NOT NULL
  AND cs.finance_reviewed_by::text = u.id::text
  AND cs.finance_reviewed_by_login IS NULL;

-- If a value was already an email (re-run safety), keep it.
UPDATE compliance_screenings
SET screened_by_login = screened_by::text
WHERE screened_by_login IS NULL
  AND screened_by IS NOT NULL
  AND screened_by::text LIKE '%@%';

UPDATE compliance_screenings
SET finance_reviewed_by_login = finance_reviewed_by::text
WHERE finance_reviewed_by_login IS NULL
  AND finance_reviewed_by IS NOT NULL
  AND finance_reviewed_by::text LIKE '%@%';

ALTER TABLE compliance_screenings DROP COLUMN IF EXISTS screened_by;
ALTER TABLE compliance_screenings DROP COLUMN IF EXISTS finance_reviewed_by;

ALTER TABLE compliance_screenings RENAME COLUMN screened_by_login TO screened_by;
ALTER TABLE compliance_screenings RENAME COLUMN finance_reviewed_by_login TO finance_reviewed_by;

COMMENT ON COLUMN compliance_screenings.screened_by IS
  'Login email of the compliance officer who cleared/flagged this F1';
COMMENT ON COLUMN compliance_screenings.finance_reviewed_by IS
  'Login email of the finance reviewer who dismissed/approved/uploaded ID';
