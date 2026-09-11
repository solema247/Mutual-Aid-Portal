-- Flags a states-row (locality) for data-team review. Does not change geography.
-- Apply in sudan-err-portal-schema (or locally) before using Mark for review.

CREATE TABLE IF NOT EXISTS state_locality_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  github_issue_url TEXT,
  github_issue_number INTEGER,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'cleared')),
  flagged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cleared_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS state_locality_reviews_one_open
  ON state_locality_reviews (state_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_state_locality_reviews_status
  ON state_locality_reviews (status);

CREATE INDEX IF NOT EXISTS idx_state_locality_reviews_state_id
  ON state_locality_reviews (state_id);

ALTER TABLE state_locality_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can select" ON state_locality_reviews;
DROP POLICY IF EXISTS "Authenticated can insert" ON state_locality_reviews;
DROP POLICY IF EXISTS "Authenticated can update" ON state_locality_reviews;

CREATE POLICY "Authenticated can select" ON state_locality_reviews
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert" ON state_locality_reviews
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update" ON state_locality_reviews
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON state_locality_reviews TO authenticated;
