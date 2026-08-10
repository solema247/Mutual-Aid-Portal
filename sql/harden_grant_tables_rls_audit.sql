-- Harden grant canonical tables against mass wipes via authenticated JWT.
-- 1) Restrict INSERT/UPDATE/DELETE to support/admin/superadmin (matches requireGrantEditor).
-- 2) Audit trail for INSERT/UPDATE/DELETE (including FK cascade deletes).
-- SELECT policies left unchanged.

-- ---------------------------------------------------------------------------
-- Helper: grant editor roles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_grant_editor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.auth_user_id = auth.uid()
      AND u.role IN ('support', 'admin', 'superadmin')
  );
$$;

COMMENT ON FUNCTION public.is_grant_editor() IS
  'True when auth.uid() maps to users.role in (support, admin, superadmin). Used by grant-table RLS.';

REVOKE ALL ON FUNCTION public.is_grant_editor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_grant_editor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_grant_editor() TO anon;
GRANT EXECUTE ON FUNCTION public.is_grant_editor() TO service_role;

-- ---------------------------------------------------------------------------
-- Replace write policies on distribution_decision_master_sheet_1
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS distribution_decision_master_sheet_1_delete_authenticated
  ON public.distribution_decision_master_sheet_1;
DROP POLICY IF EXISTS distribution_decision_master_sheet_1_insert_authenticated
  ON public.distribution_decision_master_sheet_1;
DROP POLICY IF EXISTS distribution_decision_master_sheet_1_update_authenticated
  ON public.distribution_decision_master_sheet_1;

CREATE POLICY distribution_decision_master_sheet_1_insert_grant_editor
  ON public.distribution_decision_master_sheet_1
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_grant_editor());

CREATE POLICY distribution_decision_master_sheet_1_update_grant_editor
  ON public.distribution_decision_master_sheet_1
  FOR UPDATE
  TO authenticated
  USING (public.is_grant_editor())
  WITH CHECK (public.is_grant_editor());

CREATE POLICY distribution_decision_master_sheet_1_delete_grant_editor
  ON public.distribution_decision_master_sheet_1
  FOR DELETE
  TO authenticated
  USING (public.is_grant_editor());

-- ---------------------------------------------------------------------------
-- Replace write policies on allocations_by_date
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS allocations_by_date_delete_authenticated
  ON public.allocations_by_date;
DROP POLICY IF EXISTS allocations_by_date_insert_authenticated
  ON public.allocations_by_date;
DROP POLICY IF EXISTS allocations_by_date_update_authenticated
  ON public.allocations_by_date;

CREATE POLICY allocations_by_date_insert_grant_editor
  ON public.allocations_by_date
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_grant_editor());

CREATE POLICY allocations_by_date_update_grant_editor
  ON public.allocations_by_date
  FOR UPDATE
  TO authenticated
  USING (public.is_grant_editor())
  WITH CHECK (public.is_grant_editor());

CREATE POLICY allocations_by_date_delete_grant_editor
  ON public.allocations_by_date
  FOR DELETE
  TO authenticated
  USING (public.is_grant_editor());

-- ---------------------------------------------------------------------------
-- Audit table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grant_table_audit (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  schema_name text NOT NULL DEFAULT 'public',
  table_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  row_pk text,
  old_record jsonb,
  new_record jsonb,
  auth_uid uuid,
  db_role text,
  client_addr inet
);

COMMENT ON TABLE public.grant_table_audit IS
  'DML audit for distribution_decision_master_sheet_1 and allocations_by_date (trigger-written).';

CREATE INDEX IF NOT EXISTS idx_grant_table_audit_occurred_at
  ON public.grant_table_audit (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_grant_table_audit_table_action
  ON public.grant_table_audit (table_name, action, occurred_at DESC);

ALTER TABLE public.grant_table_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grant_table_audit_select_grant_editor ON public.grant_table_audit;
CREATE POLICY grant_table_audit_select_grant_editor
  ON public.grant_table_audit
  FOR SELECT
  TO authenticated
  USING (public.is_grant_editor());

-- No INSERT/UPDATE/DELETE policies for authenticated — trigger writes as owner/definer.

GRANT SELECT ON public.grant_table_audit TO authenticated;
GRANT ALL ON public.grant_table_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.grant_table_audit_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- Audit trigger function (SECURITY DEFINER so JWT users can still produce rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_table_audit_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    IF TG_TABLE_NAME = 'allocations_by_date' THEN
      v_pk := OLD."Allocation_ID";
    ELSE
      v_pk := OLD.id::text;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'allocations_by_date' THEN
      v_pk := NEW."Allocation_ID";
    ELSE
      v_pk := NEW.id::text;
    END IF;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'allocations_by_date' THEN
      v_pk := NEW."Allocation_ID";
    ELSE
      v_pk := NEW.id::text;
    END IF;
  END IF;

  INSERT INTO public.grant_table_audit (
    schema_name,
    table_name,
    action,
    row_pk,
    old_record,
    new_record,
    auth_uid,
    db_role,
    client_addr
  ) VALUES (
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    TG_OP,
    v_pk,
    v_old,
    v_new,
    auth.uid(),
    current_user,
    inet_client_addr()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.grant_table_audit_trg() IS
  'Writes grant_table_audit rows for grant canonical table DML.';

DROP TRIGGER IF EXISTS trg_grant_audit_decisions ON public.distribution_decision_master_sheet_1;
CREATE TRIGGER trg_grant_audit_decisions
  AFTER INSERT OR UPDATE OR DELETE ON public.distribution_decision_master_sheet_1
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_table_audit_trg();

DROP TRIGGER IF EXISTS trg_grant_audit_allocations ON public.allocations_by_date;
CREATE TRIGGER trg_grant_audit_allocations
  AFTER INSERT OR UPDATE OR DELETE ON public.allocations_by_date
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_table_audit_trg();
