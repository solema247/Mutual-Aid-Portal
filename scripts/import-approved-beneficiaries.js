#!/usr/bin/env node

/**
 * One-time import of the pre-approved beneficiary list (previously screened
 * and approved by the compliance officer) into the approved_beneficiaries
 * whitelist. Names on this list auto-approve during F1 compliance screening.
 *
 * Usage: node scripts/import-approved-beneficiaries.js <path-to-list.csv>
 *
 * Input: CSV with a "name" column, or a plain text file with one name per line.
 * Requires SUPABASE_SERVICE_ROLE_KEY (or anon key) in .env.local.
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) {
    console.error('Error: .env.local file not found')
    process.exit(1)
  }
  const env = {}
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '')
      }
    }
  })
  return env
}

// Must stay in sync with nameTokens/normalizedNameKey in src/lib/compliance.ts
const STOP_WORDS = new Set([
  'bin', 'ibn', 'mr', 'mrs', 'dr', 'the', 'of', 'for',
  'name', 'account', 'number', 'bank', 'signature'
])

function nameTokens(name) {
  const cleaned = (name || '').toLowerCase().replace(/[^a-z\u0600-\u06ff\s]/g, ' ')
  return cleaned
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
}

function normalizedNameKey(name) {
  const counts = new Map()
  for (const tok of nameTokens(name)) {
    counts.set(tok, (counts.get(tok) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([tok, n]) => `${tok}:${n}`)
    .join('|')
}

function parseNames(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8')
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []

  // CSV with header: find the "name" column
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''))
  const nameIdx = header.indexOf('name')
  if (nameIdx >= 0) {
    return lines.slice(1).map(line => {
      // naive CSV split is fine for single-column-name lists; quoted commas in
      // names are not expected in this data
      const cols = line.split(',')
      return (cols[nameIdx] || '').trim().replace(/^["']|["']$/g, '')
    }).filter(Boolean)
  }

  // Plain list: one name per line
  return lines
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    console.error('Usage: node scripts/import-approved-beneficiaries.js <path-to-list.csv>')
    process.exit(1)
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: file not found: ${inputPath}`)
    process.exit(1)
  }

  const env = loadEnvFile()
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  const names = parseNames(inputPath)
  console.log(`Read ${names.length} name(s) from ${inputPath}`)

  const byKey = new Map()
  let skipped = 0
  for (const name of names) {
    const key = normalizedNameKey(name)
    if (!key || nameTokens(name).length < 2) {
      console.warn(`  Skipping (needs at least 2 name words): "${name}"`)
      skipped++
      continue
    }
    if (!byKey.has(key)) byKey.set(key, name)
  }

  const rows = Array.from(byKey.entries()).map(([normalized_key, name]) => ({
    name,
    normalized_key,
    source: 'import'
  }))

  console.log(`Importing ${rows.length} unique name(s) (${skipped} skipped)...`)

  let imported = 0
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await supabase
      .from('approved_beneficiaries')
      .upsert(chunk, { onConflict: 'normalized_key', ignoreDuplicates: true })
    if (error) {
      console.error('Import error:', error.message)
      process.exit(1)
    }
    imported += chunk.length
  }

  console.log(`Done. ${imported} name(s) in the approved beneficiaries whitelist.`)
  console.log('These payees will now auto-approve during F1 compliance screening.')
}

main()
