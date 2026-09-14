-- Role default permission packs (editable in UI). JSON file is seed/fallback only.
CREATE TABLE IF NOT EXISTS role_permission_defaults (
  role TEXT PRIMARY KEY,
  function_codes TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

ALTER TABLE role_permission_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can select role defaults" ON role_permission_defaults;
CREATE POLICY "Authenticated can select role defaults" ON role_permission_defaults
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert role defaults" ON role_permission_defaults;
CREATE POLICY "Authenticated can insert role defaults" ON role_permission_defaults
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can update role defaults" ON role_permission_defaults;
CREATE POLICY "Authenticated can update role defaults" ON role_permission_defaults
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can delete role defaults" ON role_permission_defaults;
CREATE POLICY "Authenticated can delete role defaults" ON role_permission_defaults
  FOR DELETE TO authenticated USING (true);
