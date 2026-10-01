-- Allow soft-deleted portal accounts without removing public.users rows.
-- Hard DELETE is unsafe because many tables reference users(id) for audit fields
-- (created_by, updated_by, reviewed_by, flagged_by, cleared_by, addressed_by, etc.).
--
-- Soft-delete sets status = 'deleted', clears auth_user_id, and removes auth.users.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_status_check
  CHECK (
    status IS NULL
    OR status IN ('pending', 'active', 'suspended', 'deleted')
  );

COMMENT ON CONSTRAINT users_status_check ON public.users IS
  'Portal account lifecycle. deleted = soft-deleted; row kept for historical FKs.';
