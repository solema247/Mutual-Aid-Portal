#!/usr/bin/env node

/**
 * Script to create a temporary test user for local development
 * Usage: node scripts/create-test-user.js
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

// Use service role key if available, otherwise use anon key
const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createTestUser() {
  const testEmail = 'test@mutualaid.local'
  const testPassword = 'Test123!@#'
  const displayName = 'Test User'

  console.log('🔧 Creating temporary test user...')
  console.log(`Email: ${testEmail}`)
  console.log(`Password: ${testPassword}`)
  console.log('')

  try {
    // Step 1: Create auth user
    console.log('Step 1: Creating auth user...')
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // Auto-confirm email for local dev
      user_metadata: {
        has_changed_password: true,
        is_temporary_password: false
      }
    })

    if (authError) {
      // If user already exists, try to get existing user
      if (authError.message.includes('already registered')) {
        console.log('⚠️  User already exists, fetching existing user...')
        const { data: existingUser } = await supabase.auth.admin.listUsers()
        const user = existingUser?.users?.find(u => u.email === testEmail)
        
        if (!user) {
          throw new Error('User exists but could not be retrieved')
        }
        
        authData = { user }
        console.log('✅ Using existing auth user')
      } else {
        throw authError
      }
    } else {
      console.log('✅ Auth user created successfully')
    }

    if (!authData?.user) {
      throw new Error('Failed to get user data')
    }

    const userId = authData.user.id
    console.log(`User ID: ${userId}`)
    console.log('')

    // Step 2: Check if user record exists
    console.log('Step 2: Checking users table...')
    const { data: existingUserRecord, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', userId)
      .single()

    if (existingUserRecord && !checkError) {
      console.log('⚠️  User record already exists in users table')
      console.log('✅ Test user is ready to use!')
      console.log('')
      console.log('📋 Login Credentials:')
      console.log(`   Email: ${testEmail}`)
      console.log(`   Password: ${testPassword}`)
      console.log(`   Role: ${existingUserRecord.role}`)
      console.log(`   Status: ${existingUserRecord.status}`)
      return
    }

    // Step 3: Create user record in users table
    console.log('Step 3: Creating user record in users table...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert([
        {
          auth_user_id: userId,
          display_name: displayName,
          role: 'admin', // Admin role for full access
          status: 'active',
          err_id: null,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single()

    if (userError) {
      console.error('❌ Error creating user record:', userError)
      throw userError
    }

    console.log('✅ User record created successfully')
    console.log('')

    // Success!
    console.log('🎉 Test user created successfully!')
    console.log('')
    console.log('📋 Login Credentials:')
    console.log(`   Email: ${testEmail}`)
    console.log(`   Password: ${testPassword}`)
    console.log(`   Role: admin`)
    console.log(`   Status: active`)
    console.log('')
    console.log('🌐 Access the portal at: http://localhost:3001/login')
    console.log('')

  } catch (error) {
    console.error('❌ Error creating test user:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  }
}

createTestUser()

