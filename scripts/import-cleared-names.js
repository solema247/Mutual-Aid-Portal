#!/usr/bin/env node

/**
 * Import a compliance-officer "cleared names" list (English + Arabic) into the
 * approved_beneficiaries exception list, and reconcile it against the banking
 * details stored in err_projects so already-flagged/pending F1s for these
 * beneficiaries are cleared.
 *
 * Input: .xlsx with two columns of names, e.g. "Name ENG" and "Name AR"
 * (falls back to the first two columns if those headers are absent).
 *
 * Usage:
 *   node scripts/import-cleared-names.js <file.xlsx>            # dry run (no writes)
 *   node scripts/import-cleared-names.js <file.xlsx> --commit   # write whitelist + clear exact matches
 *   node scripts/import-cleared-names.js <file.xlsx> --commit --fuzzy
 *        # also clear high-confidence subset matches (DB name tokens ⊆ a cleared full name, >=3 shared tokens)
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

const { createClient } = require('@supabase/supabase-js')
const XLSX = require('xlsx')
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

// --- Name normalization (kept in sync with src/lib/compliance.ts) ---
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
  for (const tok of nameTokens(name)) counts.set(tok, (counts.get(tok) || 0) + 1)
  return Array.from(counts.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([tok, n]) => `${tok}:${n}`)
    .join('|')
}

// Mirror of extractNamesFromBanking in src/lib/compliance.ts
function extractNamesFromBanking(text) {
  if (!text) return []
  const names = new Set()
  const nameLineRe = /(?:^|\n)\s*Name\s*:\s*([^\n]+)/gi
  let m
  while ((m = nameLineRe.exec(text)) !== null) {
    const candidate = m[1].trim()
    if (candidate.length > 2) names.add(candidate)
  }
  const bankKeywordRe = /bank|account|number|iban|signature|date\s*:|بنك/i
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4)
  for (const line of lines) {
    if (bankKeywordRe.test(line) || /^\d+$/.test(line.replace(/\s/g, ''))) continue
    if (line.length >= 6 && line.length < 100 && line.split(/\s+/).length >= 2) {
      names.add(line.replace(/^(the works of)\s+/i, ''))
    }
  }
  const byKey = new Map()
  for (const candidate of names) {
    if (nameTokens(candidate).length < 2) continue
    const key = normalizedNameKey(candidate)
    const cleaned = candidate.replace(/^\s*Name\s*:\s*/i, '').trim()
    const existing = byKey.get(key)
    if (!existing || cleaned.length < existing.length) byKey.set(key, cleaned)
  }
  return Array.from(byKey.values())
}

function readClearedNames(xlsxPath) {
  const wb = XLSX.readFile(xlsxPath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (rows.length === 0) return []
  const header = rows[0].map(h => (h || '').toString().trim().toLowerCase())
  let engIdx = header.findIndex(h => h.includes('eng'))
  let arIdx = header.findIndex(h => h.includes('ar'))
  let body = rows.slice(1)
  if (engIdx === -1 && arIdx === -1) {
    // No recognizable header — treat first two columns as eng, ar
    engIdx = 0
    arIdx = 1
    body = rows
  } else {
    if (engIdx === -1) engIdx = arIdx === 0 ? 1 : 0
    if (arIdx === -1) arIdx = engIdx === 0 ? 1 : 0
  }
  return body
    .map(r => ({
      eng: (r[engIdx] || '').toString().trim(),
      ar: (r[arIdx] || '').toString().trim()
    }))
    .filter(x => x.eng || x.ar)
}

async function main() {
  const inputPath = process.argv[2]
  const commit = process.argv.includes('--commit')
  const fuzzy = process.argv.includes('--fuzzy')
  if (!inputPath) {
    console.error('Usage: node scripts/import-cleared-names.js <file.xlsx> [--commit] [--fuzzy]')
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

  console.log(`\nMode: ${commit ? 'COMMIT (writes enabled)' : 'DRY RUN (no writes)'}${fuzzy ? ' + FUZZY subset clearing' : ''}\n`)

  // 1) Parse cleared names ----------------------------------------------------
  const cleared = readClearedNames(inputPath)
  const whitelistByKey = new Map() // normalized_key -> display name
  const clearedTokenSets = [] // { key, tokens:Set<string>, display } for subset matching (english + arabic)
  for (const { eng, ar } of cleared) {
    for (const name of [eng, ar]) {
      if (!name) continue
      const toks = nameTokens(name)
      if (toks.length < 2) continue
      const key = normalizedNameKey(name)
      if (!whitelistByKey.has(key)) whitelistByKey.set(key, name)
      clearedTokenSets.push({ key, tokens: new Set(toks), display: name })
    }
  }
  const clearedKeys = new Set(whitelistByKey.keys())
  console.log(`Cleared list: ${cleared.length} rows → ${clearedKeys.size} unique name keys (EN+AR)`) 

  // 2) Import into approved_beneficiaries -------------------------------------
  const rows = Array.from(whitelistByKey.entries()).map(([normalized_key, name]) => ({
    name,
    normalized_key,
    source: 'import'
  }))
  if (commit) {
    let imported = 0
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200)
      const { error } = await supabase
        .from('approved_beneficiaries')
        .upsert(chunk, { onConflict: 'normalized_key', ignoreDuplicates: true })
      if (error) {
        console.error('Whitelist import error:', error.message)
        process.exit(1)
      }
      imported += chunk.length
    }
    console.log(`Whitelist: upserted ${imported} name key(s) into approved_beneficiaries.`)
  } else {
    console.log(`Whitelist: would upsert ${rows.length} name key(s) into approved_beneficiaries.`)
  }

  // 3) Reconcile against banking details stored in err_projects ---------------
  // Pull screenings + the banking_details from the relevant table (err_projects).
  const { data: screenings, error: scErr } = await supabase
    .from('compliance_screenings')
    .select('id, project_id, names, status, flag_type, finance_review_status')
  if (scErr) throw scErr

  const projIds = screenings.map(s => s.project_id)
  const bankById = new Map()
  for (let i = 0; i < projIds.length; i += 200) {
    const chunk = projIds.slice(i, i + 200)
    const { data: proj, error: pErr } = await supabase
      .from('err_projects')
      .select('id, banking_details')
      .in('id', chunk)
    if (pErr) throw pErr
    for (const p of proj || []) bankById.set(p.id, p.banking_details || '')
  }

  const subsetMatch = (extractedNames) => {
    // Every extracted name must be a >=3-token subset of some cleared full name
    if (!extractedNames.length) return null
    const evidence = []
    for (const nm of extractedNames) {
      const toks = new Set(nameTokens(nm))
      if (toks.size < 3) return null
      const hit = clearedTokenSets.find(c =>
        c.tokens.size >= toks.size &&
        Array.from(toks).every(t => c.tokens.has(t))
      )
      if (!hit) return null
      evidence.push({ dbName: nm, clearedName: hit.display })
    }
    return evidence
  }

  const exactHits = []
  const fuzzyHits = []
  for (const s of screenings) {
    // Prefer freshly extracting from the live banking details (relevant table)
    const banking = bankById.get(s.project_id) || ''
    const extracted = extractNamesFromBanking(banking)
    const names = extracted.length ? extracted : (Array.isArray(s.names) ? s.names : [])
    if (!names.length) continue
    const keys = names.map(normalizedNameKey)
    const exact = keys.length > 0 && keys.every(k => clearedKeys.has(k))
    if (exact) {
      exactHits.push({ s, names, banking })
      continue
    }
    const ev = subsetMatch(names)
    if (ev) fuzzyHits.push({ s, names, banking, evidence: ev })
  }

  const summarize = (label, hits) => {
    console.log(`\n${label}: ${hits.length}`)
    for (const h of hits.slice(0, 40)) {
      const st = h.s.status + (h.s.flag_type ? `/${h.s.flag_type}` : '')
      console.log(`  - project ${h.s.project_id} [${st}]`)
      console.log(`      names: ${JSON.stringify(h.names)}`)
      console.log(`      bank : ${JSON.stringify((h.banking || '').replace(/\n/g, ' | ').slice(0, 140))}`)
      if (h.evidence) {
        for (const e of h.evidence) console.log(`      match: "${e.dbName}" ⊆ cleared "${e.clearedName}"`)
      }
    }
    if (hits.length > 40) console.log(`  ... and ${hits.length - 40} more`)
  }
  summarize('Exact name matches (all payee names on cleared list)', exactHits)
  if (fuzzy) summarize('Fuzzy subset matches (>=3 shared tokens)', fuzzyHits)
  else console.log(`\nFuzzy subset candidates (not applied; pass --fuzzy to clear): ${fuzzyHits.length}`)

  // 4) Clear matched screenings -----------------------------------------------
  // Safety: a typed sanctions_match is only ever cleared on an EXACT full-name
  // match, never on a fuzzy subset match — those stay for manual review.
  const safeFuzzy = fuzzyHits.filter(h => {
    if (h.s.flag_type === 'sanctions_match') {
      console.warn(`\n  SKIP fuzzy-clear of sanctions_match ${h.s.project_id} — needs manual review.`)
      return false
    }
    return true
  })
  const toClear = fuzzy ? [...exactHits, ...safeFuzzy] : exactHits
  const clearable = toClear.filter(h => h.s.status !== 'auto_approved' && h.s.status !== 'cleared')
  if (clearable.length === 0) {
    console.log('\nNo screenings need clearing.')
  } else if (commit) {
    let cleared = 0
    for (const h of clearable) {
      const { error } = await supabase
        .from('compliance_screenings')
        .update({
          status: 'auto_approved',
          flag_note: 'Cleared via compliance-officer cleared-names list import',
          screened_at: new Date().toISOString(),
          finance_review_status: null,
          finance_review_note: null
        })
        .eq('id', h.s.id)
      if (error) {
        console.error(`  Failed to clear ${h.s.project_id}:`, error.message)
        continue
      }
      cleared++
    }
    console.log(`\nCleared ${cleared} screening(s) → status auto_approved (payments unblocked).`)
  } else {
    console.log(`\nWould clear ${clearable.length} screening(s) (run with --commit).`)
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
