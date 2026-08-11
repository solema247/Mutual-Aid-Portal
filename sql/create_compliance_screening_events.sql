-- Immutable audit trail for compliance screening / sanctions decisions.
-- Records who cleared, flagged, dismissed, approved, or uploaded an ID.

CREATE TABLE IF NOT EXISTS compliance_screening_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id UUID NOT NULL REFERENCES compliance_screenings(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES err_projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN (
      'clear',
      'flag_missing_id',
      'flag_sanctions_match',
      'finance_dismiss',
      'finance_approve',
      'upload_id',
      'reopen_pending'
    )),
  actor_id UUID REFERENCES users(id),
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_screening_events_screening
  ON compliance_screening_events(screening_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_screening_events_project
  ON compliance_screening_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_screening_events_action
  ON compliance_screening_events(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_screening_events_created
  ON compliance_screening_events(created_at DESC);

ALTER TABLE compliance_screening_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select compliance events"
  ON compliance_screening_events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert compliance events"
  ON compliance_screening_events
  FOR INSERT TO authenticated WITH CHECK (true);

-- No UPDATE / DELETE policies: audit rows are append-only for authenticated users.

COMMENT ON TABLE compliance_screening_events IS
  'Append-only audit log of compliance Clear/Flag and finance review actions';
