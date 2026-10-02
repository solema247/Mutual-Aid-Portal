-- Partner Role v1 Phase 1: org attachment on users + grant ownership on grants_grid_view.
-- No backfill: partner_id remains NULL until mapped in a later phase.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS partner_id uuid
  REFERENCES public.partners(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.users.partner_id IS
  'Partner organization for role=partner users. NULL for other roles. ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS users_partner_id_idx
  ON public.users (partner_id);

ALTER TABLE public.grants_grid_view
  ADD COLUMN IF NOT EXISTS partner_id uuid
  REFERENCES public.partners(id)
  ON DELETE SET NULL;

COMMENT ON COLUMN public.grants_grid_view.partner_id IS
  'Authoritative partner org that owns this grant. Used for Partner role data scope. ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS grants_grid_view_partner_id_idx
  ON public.grants_grid_view (partner_id);
