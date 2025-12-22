#!/usr/bin/env node

/**
 * Script to test Supabase connection from local environment
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

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

console.log('🔍 Testing Supabase Connection...')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing')
  process.exit(1)
}

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  process.exit(1)
}

console.log('✅ Environment Variables Found:')
console.log(`   URL: ${supabaseUrl}`)
console.log(`   Key Format: ${supabaseAnonKey.substring(0, 20)}... (${supabaseAnonKey.length} chars)`)
console.log('')

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  try {
    // Test 1: Check if we can access the REST API
    console.log('Test 1: Testing REST API connection...')
    const { data: restData, error: restError } = await supabase
      .from('users')
      .select('count')
      .limit(1)
    
    if (restError) {
      if (restError.message.includes('Invalid API key')) {
        console.log('❌ REST API Test: FAILED - Invalid API key')
        console.log('   Error:', restError.message)
        console.log('')
        console.log('💡 The API key format appears incorrect.')
        console.log('   Expected: JWT format starting with "eyJ" (200+ chars)')
        console.log('   Current: Starts with "' + supabaseAnonKey.substring(0, 4) + '" (' + supabaseAnonKey.length + ' chars)')
        console.log('')
        console.log('   Fix: Get the correct anon key from:')
        console.log('   https://supabase.com/dashboard/project/khavbdocjufkyhwpiniw/settings/api')
        return false
      } else {
        console.log('⚠️  REST API Test: Connection works but query failed')
        console.log('   Error:', restError.message)
        console.log('   (This might be normal if tables don\'t exist yet)')
      }
    } else {
      console.log('✅ REST API Test: SUCCESS - Can connect to Supabase')
    }
    console.log('')

    // Test 2: Check if we can access auth endpoints
    console.log('Test 2: Testing Auth API connection...')
    try {
      // Try to get auth settings (this doesn't require authentication)
      const authResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: {
          'apikey': supabaseAnonKey
        }
      })
      
      if (authResponse.ok) {
        console.log('✅ Auth API Test: SUCCESS - Can connect to Auth endpoints')
      } else if (authResponse.status === 401) {
        console.log('❌ Auth API Test: FAILED - Invalid API key')
        console.log('   Status:', authResponse.status)
        return false
      } else {
        console.log('⚠️  Auth API Test: Unexpected response')
        console.log('   Status:', authResponse.status)
      }
    } catch (fetchError) {
      console.log('⚠️  Auth API Test: Network error')
      console.log('   Error:', fetchError.message)
    }
    console.log('')

    // Test 3: Check database tables
    console.log('Test 3: Testing database tables access...')
    const tables = ['users', 'emergency_rooms', 'states', 'err_projects']
    let tablesFound = 0
    
    for (const table of tables) {
      try {
        const { error } = await supabase.from(table).select('*').limit(0)
        if (!error) {
          console.log(`   ✅ Table "${table}": Accessible`)
          tablesFound++
        } else if (error.code === 'PGRST116') {
          console.log(`   ⚠️  Table "${table}": Not found (might not exist yet)`)
        } else {
          console.log(`   ❌ Table "${table}": Error - ${error.message}`)
        }
      } catch (err) {
        console.log(`   ❌ Table "${table}": Failed - ${err.message}`)
      }
    }
    console.log('')

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (restError && restError.message.includes('Invalid API key')) {
      console.log('❌ CONNECTION STATUS: FAILED')
      console.log('')
      console.log('Reason: Invalid API key format')
      console.log('')
      console.log('To fix:')
      console.log('1. Go to: https://supabase.com/dashboard/project/khavbdocjufkyhwpiniw/settings/api')
      console.log('2. Copy the "anon" or "public" key (should start with "eyJ")')
      console.log('3. Update .env.local with the correct key')
      console.log('4. Restart the dev server')
      return false
    } else {
      console.log('✅ CONNECTION STATUS: CONNECTED')
      console.log('')
      console.log(`   Tables accessible: ${tablesFound}/${tables.length}`)
      console.log('   Your local environment is connected to Supabase!')
      return true
    }

  } catch (error) {
    console.error('❌ Connection test failed:', error.message)
    return false
  }
}

testConnection().then(connected => {
  process.exit(connected ? 0 : 1)
})



