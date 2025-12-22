-- SQL Script to Create Test User Directly in Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- Step 1: Create auth user (if not exists)
-- Note: You'll need to hash the password. Use this online tool: https://bcrypt-generator.com/
-- Or use Supabase's built-in crypt function

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'temp@test.local';
  v_password TEXT := 'TempTest123!';
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  -- If user doesn't exist, create it
  IF v_user_id IS NULL THEN
    -- Insert into auth.users
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
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
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
    )
    RETURNING id INTO v_user_id;

    RAISE NOTICE 'Auth user created with ID: %', v_user_id;
  ELSE
    RAISE NOTICE 'Auth user already exists with ID: %', v_user_id;
  END IF;

  -- Step 2: Create user record in users table (if not exists)
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE auth_user_id = v_user_id
  ) THEN
    INSERT INTO users (
      auth_user_id,
      display_name,
      role,
      status,
      err_id,
      created_at
    ) VALUES (
      v_user_id,
      'Temp Test User',
      'admin',
      'active',
      null,
      now()
    );

    RAISE NOTICE 'User record created successfully';
  ELSE
    RAISE NOTICE 'User record already exists';
  END IF;

END $$;

-- Verify the user was created
SELECT 
  u.id,
  u.display_name,
  u.role,
  u.status,
  au.email
FROM users u
JOIN auth.users au ON u.auth_user_id = au.id
WHERE au.email = 'temp@test.local';



