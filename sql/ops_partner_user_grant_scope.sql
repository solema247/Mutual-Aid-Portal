-- Partner role grant scope via ops_partners (replaces partners-based grant scoping).
-- Keeps public.partners for MOUs and other non-scope uses.
-- Idempotent: safe to re-run.
--
-- Model:
--   users.ops_partner_id → one ops_partners row (partner users only)
--   grant_ops_partners   → many-to-many grants_grid_view ↔ ops_partners
--
-- Example: Avaaz grant linked to P2H + Avaaz; Avaaz 2 linked to Avaaz only.
-- An Avaaz partner user sees both grants; a P2H user sees Avaaz but not Avaaz 2.

-- ---------------------------------------------------------------------------
-- users.ops_partner_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ops_partner_id uuid
  REFERENCES public.ops_partners(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.users.ops_partner_id IS
  'Ops partner for role=partner users (grant scope). NULL for other roles. Distinct from partners(id) used by MOUs.';

CREATE INDEX IF NOT EXISTS users_ops_partner_id_idx
  ON public.users (ops_partner_id);

-- ---------------------------------------------------------------------------
-- grant ↔ ops_partner (many-to-many)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grant_ops_partners (
  grant_grid_id uuid NOT NULL
    REFERENCES public.grants_grid_view(id)
    ON DELETE CASCADE,
  ops_partner_id uuid NOT NULL
    REFERENCES public.ops_partners(id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grant_grid_id, ops_partner_id)
);

COMMENT ON TABLE public.grant_ops_partners IS
  'Links grants to one or more ops_partners. Used for partner-role data scope.';

CREATE INDEX IF NOT EXISTS grant_ops_partners_ops_partner_id_idx
  ON public.grant_ops_partners (ops_partner_id);

CREATE INDEX IF NOT EXISTS grant_ops_partners_grant_grid_id_idx
  ON public.grant_ops_partners (grant_grid_id);

ALTER TABLE public.grant_ops_partners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grant_ops_partners_select_authenticated ON public.grant_ops_partners;
CREATE POLICY grant_ops_partners_select_authenticated
  ON public.grant_ops_partners
  FOR SELECT
  TO authenticated
  USING (true);

-- Writes via service role / admin tooling (no authenticated insert/update/delete policies).
GRANT SELECT ON public.grant_ops_partners TO authenticated;
GRANT ALL ON public.grant_ops_partners TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.grant_ops_partners FROM authenticated;
REVOKE ALL ON public.grant_ops_partners FROM anon;

-- ---------------------------------------------------------------------------
-- Optional seed: match grants_grid_view.partner_name → ops_partners.name (1:1).
-- Multi-partner links (e.g. Avaaz grant + P2H) must be added manually afterward.
-- ---------------------------------------------------------------------------
INSERT INTO public.grant_ops_partners (grant_grid_id, ops_partner_id)
SELECT g.id, op.id
FROM public.grants_grid_view g
INNER JOIN public.ops_partners op
  ON lower(trim(op.name)) = lower(trim(g.partner_name))
WHERE g.partner_name IS NOT NULL
  AND trim(g.partner_name) <> ''
ON CONFLICT DO NOTHING;

-- Example multi-partner link (run manually after confirming UUIDs):
-- INSERT INTO public.grant_ops_partners (grant_grid_id, ops_partner_id)
-- SELECT g.id, op.id
-- FROM public.grants_grid_view g
-- CROSS JOIN public.ops_partners op
-- WHERE g.grant_id = 'Avaaz'
--   AND op.name IN ('Avaaz', 'P2H')
-- ON CONFLICT DO NOTHING;
