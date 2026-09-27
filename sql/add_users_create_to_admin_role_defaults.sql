-- Ensure Admin role defaults include users_create when the pack was seeded
-- before that permission existed. Append-only; does not rewrite other codes.
-- Idempotent.

UPDATE public.role_permission_defaults
SET
  function_codes = array_append(function_codes, 'users_create'),
  updated_at = now()
WHERE role = 'admin'
  AND NOT ('users_create' = ANY (function_codes));
