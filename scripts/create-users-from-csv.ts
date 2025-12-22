import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import { config } from 'dotenv'

// Load environment variables from .env.local if it exists
function loadEnvFile(customPath?: string) {
  const projectRoot = process.cwd()
  const possiblePaths = customPath 
    ? [customPath]
    : [
        path.join(projectRoot, '.env.local'),
        path.join(projectRoot, '.env'),
        path.join(path.dirname(projectRoot), '.env.local'), // Parent directory
      ]
  
  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        console.log(`Loading environment from: ${envPath}`)
        const result = config({ path: envPath })
        if (result.error) {
          console.error(`Error loading ${envPath}:`, result.error)
          continue
        }
        console.log(`✓ Loaded environment variables from ${envPath}`)
        // Check if required vars are loaded
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          console.log(`  ✓ Found NEXT_PUBLIC_SUPABASE_URL`)
        }
        if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
          console.log(`  ✓ Found SUPABASE_SERVICE_ROLE_KEY`)
        }
        return true
      }
    } catch (error) {
      continue
    }
  }
  
  if (!customPath) {
    console.log(`No .env.local file found. Checked:`)
    possiblePaths.forEach(p => console.log(`  - ${p}`))
    console.log(`Will use environment variables or prompt for credentials`)
  }
  return false
}

// Check for custom env path as 4th argument: csv-path [supabase-url] [service-key] [env-path]
const customEnvPath = process.argv[5]
loadEnvFile(customEnvPath)

// Helper function to prompt for input
function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// Load environment variables (can be set via env vars or command line args)
// Usage: tsx scripts/create-users-from-csv.ts <csv-path> [supabase-url] [service-role-key]
let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
let supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

// Allow command line arguments to override env vars
// process.argv[0] = node/tsx, process.argv[1] = script path, process.argv[2+] = actual args
if (process.argv.length >= 5) {
  // CSV path, supabase URL, service role key all provided
  supabaseUrl = process.argv[3]
  supabaseServiceRoleKey = process.argv[4]
}

// If credentials are missing, prompt for them interactively
async function getCredentials(): Promise<{ url: string; key: string }> {
  if (!supabaseUrl) {
    supabaseUrl = await promptInput('Enter Supabase URL (NEXT_PUBLIC_SUPABASE_URL): ')
  }
  if (!supabaseServiceRoleKey) {
    supabaseServiceRoleKey = await promptInput('Enter Supabase Service Role Key (SUPABASE_SERVICE_ROLE_KEY): ')
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing required Supabase credentials!')
    console.error('')
    console.error('Usage options:')
    console.error('  1. Set environment variables:')
    console.error('     export NEXT_PUBLIC_SUPABASE_URL="your-url"')
    console.error('     export SUPABASE_SERVICE_ROLE_KEY="your-key"')
    console.error('     npx tsx scripts/create-users-from-csv.ts "/path/to/csv"')
    console.error('')
    console.error('  2. Pass as command line arguments:')
    console.error('     npx tsx scripts/create-users-from-csv.ts "/path/to/csv" "supabase-url" "service-role-key"')
    console.error('')
    console.error('  3. Create .env.local file with:')
    console.error('     NEXT_PUBLIC_SUPABASE_URL=your-url')
    console.error('     SUPABASE_SERVICE_ROLE_KEY=your-key')
    console.error('')
    process.exit(1)
  }

  return { url: supabaseUrl, key: supabaseServiceRoleKey }
}

// Will be initialized in main() after getting credentials
let supabaseAdmin: ReturnType<typeof createClient>

interface CSVRow {
  email: string
  name: string
}

// Temporary password for all users
const TEMP_PASSWORD = 'TempPassword123!'

// Parse CSV file
function parseCSV(filePath: string): CSVRow[] {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.trim().split('\n')
  const rows: CSVRow[] = []

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV line (handling quoted values)
    const match = line.match(/^"?(.+?)"?\s*,\s*"?(.+?)"?$/)
    if (match) {
      rows.push({
        email: match[1].trim(),
        name: match[2].trim()
      })
    }
  }

  return rows
}

// Create user in Supabase Auth
async function createAuthUser(email: string, name: string): Promise<string> {
  console.log(`Creating auth user for ${email}...`)

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEMP_PASSWORD,
    email_confirm: true, // Auto-confirm email
    user_metadata: {
      display_name: name,
      is_temporary_password: true,
      has_changed_password: false
    }
  })

  if (error) {
    throw new Error(`Failed to create auth user for ${email}: ${error.message}`)
  }

  if (!data.user) {
    throw new Error(`No user data returned for ${email}`)
  }

  console.log(`✓ Created auth user: ${email} (ID: ${data.user.id})`)
  return data.user.id
}

// Create user record in users table
async function createUserRecord(
  authUserId: string,
  email: string,
  name: string,
  role: 'admin' | 'state_err' | 'base_err' = 'base_err'
): Promise<void> {
  console.log(`Creating user record for ${email}...`)

  const { error } = await supabaseAdmin
    .from('users')
    .insert({
      auth_user_id: authUserId,
      display_name: name,
      role: role,
      status: 'active', // Set to active so they can login immediately
      err_id: null, // Can be updated later
      created_at: new Date().toISOString()
    })

  if (error) {
    throw new Error(`Failed to create user record for ${email}: ${error.message}`)
  }

  console.log(`✓ Created user record for ${email}`)
}

// Test login for a user
async function testLogin(email: string, password: string): Promise<boolean> {
  console.log(`Testing login for ${email}...`)

  // Get ANON_KEY from env or use service role key (less secure but works for testing)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || supabaseServiceRoleKey
  
  if (!anonKey) {
    console.log(`  ⚠ Skipping login test - ANON_KEY not available`)
    return false
  }

  // Create a regular client for testing (not admin)
  const supabaseTest = createClient(supabaseUrl, anonKey)

  const { data, error } = await supabaseTest.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    console.error(`✗ Login test failed for ${email}: ${error.message}`)
    return false
  }

  if (data.user) {
    console.log(`✓ Login test successful for ${email}`)
    
    // Check user metadata
    const needsPasswordChange = 
      data.user.user_metadata?.is_temporary_password === true ||
      data.user.user_metadata?.has_changed_password === false
    
    if (needsPasswordChange) {
      console.log(`  → User will be prompted to change password`)
    }

    // Sign out after test
    await supabaseTest.auth.signOut()
    return true
  }

  return false
}

// Main function
async function main() {
  // Get credentials first
  const credentials = await getCredentials()
  supabaseUrl = credentials.url
  supabaseServiceRoleKey = credentials.key

  // Create Supabase admin client
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Get CSV path from command line
  // process.argv[0] = node/tsx, process.argv[1] = script path, process.argv[2] = CSV path
  const csvPath = process.argv[2] || '/Users/nihal/Downloads/LoHub email - Sheet1.csv'

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`)
    process.exit(1)
  }

  console.log('='.repeat(60))
  console.log('Creating users from CSV')
  console.log('='.repeat(60))
  console.log(`CSV file: ${csvPath}`)
  console.log(`Temporary password: ${TEMP_PASSWORD}`)
  console.log('')

  const rows = parseCSV(csvPath)
  console.log(`Found ${rows.length} users to create\n`)

  const results = {
    success: [] as string[],
    failed: [] as { email: string; error: string }[]
  }

  // Create users
  for (const row of rows) {
    try {
      const authUserId = await createAuthUser(row.email, row.name)
      await createUserRecord(authUserId, row.email, row.name)
      results.success.push(row.email)
      console.log('')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`✗ Failed to create user ${row.email}: ${errorMessage}\n`)
      results.failed.push({ email: row.email, error: errorMessage })
    }
  }

  // Test logins
  console.log('='.repeat(60))
  console.log('Testing logins')
  console.log('='.repeat(60))
  console.log('')

  const loginResults = {
    success: [] as string[],
    failed: [] as string[]
  }

  for (const email of results.success) {
    const success = await testLogin(email, TEMP_PASSWORD)
    if (success) {
      loginResults.success.push(email)
    } else {
      loginResults.failed.push(email)
    }
    console.log('')
  }

  // Summary
  console.log('='.repeat(60))
  console.log('Summary')
  console.log('='.repeat(60))
  console.log(`Total users in CSV: ${rows.length}`)
  console.log(`Successfully created: ${results.success.length}`)
  console.log(`Failed to create: ${results.failed.length}`)
  console.log(`Login tests passed: ${loginResults.success.length}`)
  console.log(`Login tests failed: ${loginResults.failed.length}`)
  console.log('')

  if (results.failed.length > 0) {
    console.log('Failed to create:')
    results.failed.forEach(({ email, error }) => {
      console.log(`  - ${email}: ${error}`)
    })
    console.log('')
  }

  if (loginResults.failed.length > 0) {
    console.log('Login tests failed:')
    loginResults.failed.forEach(email => {
      console.log(`  - ${email}`)
    })
    console.log('')
  }

  console.log('='.repeat(60))
  console.log('User credentials:')
  console.log('='.repeat(60))
  results.success.forEach(email => {
    console.log(`Email: ${email}`)
    console.log(`Password: ${TEMP_PASSWORD}`)
    console.log('')
  })
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
