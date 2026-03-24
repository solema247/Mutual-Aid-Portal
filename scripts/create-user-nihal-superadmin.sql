-- Create user: nihal@gisagroup.org with Super Admin access
-- Run once in Supabase SQL Editor, then change password after first login.
-- https://supabase.com/dashboard → your project → SQL Editor → New query → paste → Run

-- Step 1: Create auth user (if doesn't exist)
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'nihal@gisagroup.org',
  crypt('TempPass123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"has_changed_password": false, "is_temporary_password": true, "display_name": "Nihal"}',
  false,
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'nihal@gisagroup.org'
);

-- Step 2: Create user record in users table with superadmin role (if doesn't exist)
INSERT INTO users (
  auth_user_id,
  display_name,
  role,
  status,
  err_id,
  created_at
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'nihal@gisagroup.org'),
  'Nihal',
  'superadmin',
  'active',
  null,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM users
  WHERE auth_user_id = (SELECT id FROM auth.users WHERE email = 'nihal@gisagroup.org')
);

-- Step 3: Verify
SELECT
  u.id,
  u.display_name,
  u.role,
  u.status,
  au.email,
  '✅ User ready. Change password after first login.' AS status_message
FROM users u
JOIN auth.users au ON u.auth_user_id = au.id
WHERE au.email = 'nihal@gisagroup.org';

-- First login:
--   Email:    nihal@gisagroup.org
--   Password: TempPass123!
-- Change password via: Profile / Account settings or Forgot password flow after first login.
