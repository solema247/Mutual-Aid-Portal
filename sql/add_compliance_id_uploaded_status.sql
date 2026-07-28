-- Allow finance_review_status = id_uploaded so missing-ID flags return to
-- Ahmed's screening queue after finance attaches the document (instead of
-- auto-approving into History).

ALTER TABLE compliance_screenings
  DROP CONSTRAINT IF EXISTS compliance_screenings_finance_review_status_check;

ALTER TABLE compliance_screenings
  ADD CONSTRAINT compliance_screenings_finance_review_status_check
  CHECK (
    finance_review_status IS NULL
    OR finance_review_status IN ('pending', 'approved', 'rejected', 'id_uploaded')
  );

COMMENT ON COLUMN compliance_screenings.finance_review_status IS
  'pending = awaiting finance; id_uploaded = ID attached, awaiting Ahmed re-clear; approved = resolved; rejected = flag dismissed as erroneous';
