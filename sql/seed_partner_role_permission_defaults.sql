-- Partner Role v1 Phase 2: seed read-only default permission pack for role=partner.
-- Idempotent upsert into role_permission_defaults (TEXT[] function_codes).

INSERT INTO public.role_permission_defaults (role, function_codes, updated_at)
VALUES (
  'partner',
  ARRAY[
    'dashboard_view_page',
    'grant_grants_view_page',
    'management_view_page',
    'management_view_project',
    'f1_view_page',
    'f1_view',
    'f2_view_page',
    'f3_view_page',
    'f3_view_mou',
    'f4_f5_view_page',
    'f4_view_report',
    'f5_view_report',
    'raise_ticket_page'
  ]::text[],
  now()
)
ON CONFLICT (role) DO UPDATE
SET
  function_codes = EXCLUDED.function_codes,
  updated_at = now();
