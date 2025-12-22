#!/usr/bin/env node

/**
 * Script to create a temporary test user for local development
 * Usage: node scripts/create-temp-user.js
 * 
 * This script creates a user using regular signup (no service role key needed)
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load .env.local file manually
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env.local file not found')
    process.exit(1)
  }

  const envContent = fs.readFileSync(envPath, 'utf-8')
  const env = {}
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim()
      }
    }
  })
  
  return env
}

const env = loadEnvFile()
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing Supabase credentials in .env.local')
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function createTempUser() {
  const testEmail = 'temp@test.local'
  const testPassword = 'TempTest123!'
  const displayName = 'Temp Test User'

  console.log('🔧 Creating temporary test user for code review...')
  console.log('')
  console.log('📋 Credentials:')
  console.log(`   Email: ${testEmail}`)
  console.log(`   Password: ${testPassword}`)
  console.log('')

  try {
    // Step 1: Sign up the user (this creates auth user)
    console.log('Step 1: Creating auth user via signup...')
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
      options: {
        data: {
          has_changed_password: true,
          is_temporary_password: false,
          display_name: displayName
        },
        emailRedirectTo: undefined // No email confirmation needed for local dev
      }
    })

    if (authError) {
      // Check if user already exists
      if (authError.message.includes('already registered') || authError.message.includes('User already registered')) {
        console.log('⚠️  User already exists, attempting to sign in...')
        
        // Try to sign in to get the user ID
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: testPassword
        })
        
        if (signInError) {
          console.error('❌ Could not sign in with existing user:', signInError.message)
          console.log('💡 Try resetting the password or using a different email')
          process.exit(1)
        }
        
        authData.user = signInData.user
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

    // Step 2: Check if user record exists in users table
    console.log('Step 2: Checking users table...')
    const { data: existingUserRecord, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', userId)
      .maybeSingle()

    if (existingUserRecord && !checkError) {
      console.log('⚠️  User record already exists in users table')
      console.log('✅ Test user is ready to use!')
      console.log('')
      console.log('📋 Login Credentials:')
      console.log(`   Email: ${testEmail}`)
      console.log(`   Password: ${testPassword}`)
      console.log(`   Role: ${existingUserRecord.role}`)
      console.log(`   Status: ${existingUserRecord.status}`)
      console.log('')
      console.log('🌐 Login at: http://localhost:3001/login')
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
          role: 'admin', // Admin role for full access to review changes
          status: 'active',
          err_id: null
        }
      ])
      .select()
      .single()

    if (userError) {
      console.error('❌ Error creating user record:', userError)
      
      // If it's a unique constraint error, the user might already exist
      if (userError.message.includes('duplicate') || userError.code === '23505') {
        console.log('⚠️  User record might already exist, checking again...')
        const { data: retryCheck } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', userId)
          .single()
        
        if (retryCheck) {
          console.log('✅ User record found!')
          console.log('')
          console.log('📋 Login Credentials:')
          console.log(`   Email: ${testEmail}`)
          console.log(`   Password: ${testPassword}`)
          console.log(`   Role: ${retryCheck.role}`)
          console.log(`   Status: ${retryCheck.status}`)
          return
        }
      }
      
      throw userError
    }

    console.log('✅ User record created successfully')
    console.log('')

    // Success!
    console.log('🎉 Temporary test user created successfully!')
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📋 LOGIN CREDENTIALS:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`   Email:    ${testEmail}`)
    console.log(`   Password: ${testPassword}`)
    console.log(`   Role:     admin (full access)`)
    console.log(`   Status:   active`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
    console.log('🌐 Access the portal at: http://localhost:3001/login')
    console.log('')
    console.log('💡 Use these credentials to review your code changes!')
    console.log('')

  } catch (error) {
    console.error('❌ Error creating test user:', error.message)
    console.error('Full error:', error)
    process.exit(1)
  }
}

createTempUser()



