import { config } from 'dotenv'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Papa from 'papaparse'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const rows = Papa.parse<Record<string, string>>(
    readFileSync(resolve(process.cwd(), 'data/imports/sheet-airtable-allocation-match.csv'), 'utf8'),
    { header: true, skipEmptyLines: true }
  ).data

  const target = rows.find((r) => r.sheet_sequence === 'LCC.AD.P2H.08-07-26-62-03')
  console.log('target row:', target)

  const batch = rows.filter((r) => r.sheet_code === 'LCC.AD.P2H.08-07-26-62')
  console.log('\nBatch LCC.AD.P2H.08-07-26-62:')
  for (const r of batch) {
    console.log(
      r.match_status,
      r.sheet_sequence,
      'AT=',
      r.airtable_allocation_id || r.likely_airtable_allocation_id,
      'amt=',
      r.amount,
      r.airtable_amount || ''
    )
  }

  const sb = getSupabaseAdmin()
  const { data } = await sb
    .from('allocations')
    .select('allocation_id, state, allocation_amount')
    .ilike('allocation_id', '%26-07-08%')

  console.log('\nFDW 26-07-08 allocations (West Darfur):')
  for (const r of data || []) {
    if (!String(r.state || '').toLowerCase().includes('west')) continue
    console.log(r.allocation_id, r.state, r.allocation_amount)
  }

  const claimed = rows.filter((r) =>
    String(r.airtable_allocation_id || '').includes('26-07-08.661')
  )
  console.log('\nMatched rows using AT .661:', claimed.length)
  for (const r of claimed) console.log(r.sheet_sequence, r.match_status)
}

main().catch(console.error)
