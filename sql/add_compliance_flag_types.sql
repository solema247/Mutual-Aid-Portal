-- Extend compliance screening for typed flags from demo feedback:
-- 1) missing_id — finance flags missing ID; finance uploads ID or dismisses erroneous flag
-- 2) sanctions_match — potential Descartes/OFAC match; payment stopped until dismissed

ALTER TABLE compliance_screenings
  ADD COLUMN IF NOT EXISTS flag_type TEXT
    CHECK (flag_type IS NULL OR flag_type IN ('missing_id', 'sanctions_match'));

ALTER TABLE compliance_screenings
  ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;

-- Identity / national ID document attached to the F1 after finance uploads it
ALTER TABLE err_projects
  ADD COLUMN IF NOT EXISTS identity_document_file_key TEXT;

COMMENT ON COLUMN compliance_screenings.flag_type IS
  'missing_id = F1 missing ID document; sanctions_match = potential Descartes/OFAC list match';
COMMENT ON COLUMN err_projects.identity_document_file_key IS
  'Storage path for beneficiary ID document uploaded during compliance finance review';
