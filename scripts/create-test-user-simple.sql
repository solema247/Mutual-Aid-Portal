-- Simple SQL to Create Test User
-- Copy and paste this into Supabase SQL Editor: https://supabase.com/dashboard/project/khavbdocjufkyhwpiniw/sql/new
-- Then click "Run" button

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
  'temp@test.local',
  crypt('TempTest123!', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"has_changed_password": true, "is_temporary_password": false, "display_name": "Temp Test User"}',
  false,
  '',
  '',
  '',
  ''
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'temp@test.local'
);

-- Step 2: Create user record in users table (if doesn't exist)
INSERT INTO users (
  auth_user_id,
  display_name,
  role,
  status,
  err_id,
  created_at
)
SELECT
  (SELECT id FROM auth.users WHERE email = 'temp@test.local'),
  'Temp Test User',
  'admin',
  'active',
  null,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM users 
  WHERE auth_user_id = (SELECT id FROM auth.users WHERE email = 'temp@test.local')
);

-- Step 3: Verify user was created
SELECT 
  u.id,
  u.display_name,
  u.role,
  u.status,
  au.email,
  '✅ Test user ready!' as status_message
FROM users u
JOIN auth.users au ON u.auth_user_id = au.id
WHERE au.email = 'temp@test.local';

-- Login Credentials:
-- Email: temp@test.local
-- Password: TempTest123!



