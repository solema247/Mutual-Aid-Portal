#!/usr/bin/env node

/**
 * Script to check Supabase configuration and verify API key format
 */

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

console.log('🔍 Checking Supabase Configuration...')
console.log('')

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL is missing')
  process.exit(1)
}

if (!supabaseAnonKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
  process.exit(1)
}

console.log('✅ Supabase URL:', supabaseUrl)
console.log('')
console.log('🔑 API Key Analysis:')
console.log('   Key format (first 20 chars):', supabaseAnonKey.substring(0, 20) + '...')
console.log('   Key length:', supabaseAnonKey.length)
console.log('   Starts with "sbp_":', supabaseAnonKey.startsWith('sbp_'))
console.log('   Starts with "eyJ":', supabaseAnonKey.startsWith('eyJ'))
console.log('')

// Check key format
if (supabaseAnonKey.startsWith('sbp_')) {
  console.log('⚠️  WARNING: API key starts with "sbp_" which might be a service role key format.')
  console.log('   Supabase anon keys typically start with "eyJ" (JWT format).')
  console.log('')
  console.log('💡 To get the correct anon key:')
  console.log('   1. Go to https://supabase.com/dashboard')
  console.log('   2. Select your project')
  console.log('   3. Go to Settings > API')
  console.log('   4. Copy the "anon" or "public" key (not the service_role key)')
  console.log('   5. Update .env.local with the correct key')
  console.log('')
} else if (supabaseAnonKey.startsWith('eyJ')) {
  console.log('✅ API key format looks correct (JWT format)')
  console.log('')
} else {
  console.log('⚠️  WARNING: API key format is unusual')
  console.log('   Expected format: starts with "eyJ" (JWT) or "sbp_" (newer format)')
  console.log('')
}

console.log('📝 Next steps:')
console.log('   1. Verify the key in Supabase Dashboard > Settings > API')
console.log('   2. Ensure you\'re using the "anon" or "public" key (not service_role)')
console.log('   3. Restart the dev server after updating .env.local')
console.log('')



