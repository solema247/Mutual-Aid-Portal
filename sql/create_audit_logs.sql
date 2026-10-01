-- Portal application Audit Log (append-only event store).
-- Idempotent: safe to re-run.
--
-- Write path: service_role (server-side helpers only).
-- Authenticated clients: SELECT for admin/support/superadmin; no INSERT/UPDATE/DELETE.
-- Soft-deleted users keep public.users.id, so actor_user_id FKs survive soft-delete.
-- ON DELETE SET NULL only applies if a users row is hard-deleted (rare / decline path).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NULL,
  target_id uuid NULL,
  old_values jsonb NULL,
  new_values jsonb NULL,
  metadata jsonb NULL,
  ip_address inet NULL,
  user_agent text NULL
);

COMMENT ON TABLE public.audit_logs IS
  'Application audit events (user management first; domain events later). Server-side writes only.';

COMMENT ON COLUMN public.audit_logs.actor_user_id IS
  'public.users.id of the actor. Survives soft-delete; SET NULL only on hard delete.';

COMMENT ON COLUMN public.audit_logs.action IS
  'Stable event name, e.g. user.created, user.role_changed.';

COMMENT ON COLUMN public.audit_logs.metadata IS
  'Non-secret context only. Never store passwords, tokens, or service keys.';

-- ---------------------------------------------------------------------------
-- Indexes (browse + common filters)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id
  ON public.audit_logs (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
  ON public.audit_logs (target_type, target_id);

-- ---------------------------------------------------------------------------
-- Viewer helper (same privileged roles as grant editors / user-management admins)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_audit_log_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.status = 'active'
      AND u.role IN ('support', 'admin', 'superadmin')
  );
$$;

COMMENT ON FUNCTION public.is_audit_log_viewer() IS
  'True when auth.uid() maps to an active support/admin/superadmin. Used by audit_logs SELECT RLS.';

REVOKE ALL ON FUNCTION public.is_audit_log_viewer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_audit_log_viewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_audit_log_viewer() TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: no client writes; privileged select only
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select_viewer ON public.audit_logs;
CREATE POLICY audit_logs_select_viewer
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_audit_log_viewer());

-- Intentionally no INSERT/UPDATE/DELETE policies for authenticated / anon.
-- service_role bypasses RLS for server-side logAuditEvent inserts.

GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated;
REVOKE ALL ON public.audit_logs FROM anon;
