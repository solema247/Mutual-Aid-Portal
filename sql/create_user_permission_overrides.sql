CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  add_functions TEXT[] NOT NULL DEFAULT '{}',
  remove_functions TEXT[] NOT NULL DEFAULT '{}'
);

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can select" ON user_permission_overrides
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert" ON user_permission_overrides
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update" ON user_permission_overrides
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete" ON user_permission_overrides
  FOR DELETE TO authenticated USING (true);
