/**
 * Seed FSPs from data/imports/FSPs-Grid view.csv
 *
 *   npx tsx scripts/sync/seed-fsps-from-csv.ts           # dry-run
 *   npx tsx scripts/sync/seed-fsps-from-csv.ts --apply
 *
 * Requires public.fsps table (see sql/create_fsps_fund_requests_transfer_segments.sql).
 */
import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { FSP_STATUSES } from '../../src/lib/grantManagement/fundTransferHelpers'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')
const CSV_PATH = resolve(process.cwd(), 'data/imports/FSPs-Grid view.csv')

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function mainSync() {
  const raw = readFileSync(CSV_PATH, 'utf8')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('CSV empty')
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  const nameIdx = header.indexOf('Name')
  const statusIdx = header.indexOf('Status')
  const personIdx = header.indexOf('Contact Person')
  const emailIdx = header.indexOf('Contact Email')
  if (nameIdx < 0) throw new Error('Name column missing')

  const rows: Array<{
    name: string
    status: string
    contact_person: string | null
    contact_email: string | null
  }> = []

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const name = (cols[nameIdx] || '').trim()
    if (!name) continue
    const statusRaw = (cols[statusIdx] || 'Prospect').trim()
    const status = (FSP_STATUSES as readonly string[]).includes(statusRaw)
      ? statusRaw
      : 'Prospect'
    rows.push({
      name,
      status,
      contact_person: (cols[personIdx] || '').trim() || null,
      contact_email: (cols[emailIdx] || '').trim() || null,
    })
  }
  return rows
}

async function main() {
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN ===\n')
  const rows = mainSync()
  console.log(`Parsed ${rows.length} FSP(s) from CSV\n`)
  for (const r of rows) {
    console.log(`  + ${r.name} [${r.status}]`)
  }

  if (!APPLY) {
    console.log('\nRe-run with --apply after the fsps table exists.')
    return
  }

  const supabase = getSupabaseAdmin()
  let ok = 0
  for (const r of rows) {
    const { error } = await supabase.from('fsps').upsert(
      {
        name: r.name,
        status: r.status,
        contact_person: r.contact_person,
        contact_email: r.contact_email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'name' }
    )
    if (error) {
      console.error(`Failed ${r.name}:`, error.message)
    } else {
      ok++
    }
  }
  console.log(`\nUpserted ${ok}/${rows.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
