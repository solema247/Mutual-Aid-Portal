-- In-app notifications for F4 Accept/Reject (and future use).
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_read_at ON user_notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at DESC);

COMMENT ON TABLE user_notifications IS 'In-app notifications (e.g. F4 review accepted/rejected). RLS: users see only their own.';

-- RLS: users can only select/update their own rows (via users.id from auth)
ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: select own notifications (requires a helper that resolves auth.uid() -> users.id)
-- For API routes using service role or a single backend user, RLS may be bypassed; alternatively
-- use a policy that checks user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
CREATE POLICY user_notifications_select_own ON user_notifications
  FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

CREATE POLICY user_notifications_update_own ON user_notifications
  FOR UPDATE USING (user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid()));

-- Allow insert when authenticated (API uses session client to create notifications for recipients)
CREATE POLICY user_notifications_insert ON user_notifications
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
