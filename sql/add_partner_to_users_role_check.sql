-- Partner Role v1 Phase 2: allow role='partner' on public.users.
-- Updates users_role_check only. Does not modify user rows or other tables.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (
    role = ANY (
      ARRAY[
        'support'::text,
        'admin'::text,
        'superadmin'::text,
        'state_err'::text,
        'base_err'::text,
        'partner'::text
      ]
    )
  );
