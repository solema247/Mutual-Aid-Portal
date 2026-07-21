-- Visual compliance (OFAC) screening workflow
-- approved_beneficiaries: whitelist of previously screened & approved payee names
-- compliance_screenings: one screening record per F1 (err_projects row)

CREATE TABLE IF NOT EXISTS approved_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('import', 'screening_clearance')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES err_projects(id) ON DELETE CASCADE,
  names JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending_screening'
    CHECK (status IN ('pending_screening', 'cleared', 'flagged', 'auto_approved')),
  flag_note TEXT,
  screened_by UUID REFERENCES users(id),
  screened_at TIMESTAMPTZ,
  finance_review_status TEXT
    CHECK (finance_review_status IN ('pending', 'approved', 'rejected')),
  finance_review_note TEXT,
  finance_reviewed_by UUID REFERENCES users(id),
  finance_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_screenings_status ON compliance_screenings(status);
CREATE INDEX IF NOT EXISTS idx_compliance_screenings_project ON compliance_screenings(project_id);

ALTER TABLE approved_beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select" ON approved_beneficiaries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert" ON approved_beneficiaries
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update" ON approved_beneficiaries
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete" ON approved_beneficiaries
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can select" ON compliance_screenings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert" ON compliance_screenings
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update" ON compliance_screenings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete" ON compliance_screenings
  FOR DELETE TO authenticated USING (true);
