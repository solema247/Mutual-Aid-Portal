/**
 * Backfill transfer_segments.grant_id from Airtable Transfer_Segment → Grants links.
 *
 * Root cause: original backfill resolved grant links via grants_grid_view.airtable_record_id,
 * which was empty for all portal grants, so every transfer saved grant_id = null.
 *
 * This script:
 * 1. Loads Airtable Grants and maps rec… → Grant_ID text
 * 2. Optionally stamps grants_grid_view.airtable_record_id (matched by grant_id)
 * 3. Loads Transfer_Segment grant links and updates portal transfer_segments.grant_id
 *
 *   npx tsx scripts/sync/backfill-transfer-grant-ids.ts           # dry-run
 *   npx tsx scripts/sync/backfill-transfer-grant-ids.ts --apply
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { AIRTABLE_BASE_ID } from '../../src/lib/airtable/config'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

const GRANTS_TABLE = 'tbla1FnD7fNMY2q77'
const TS_TABLE = 'tbl5yeqArFbIQdzC8'

const GRANT_ID_FIELD = 'fldLyqNpJtzcW6aKl'
const TS_TRANSFER_ID = 'fldIiXcn4lXwizbIg'
const TS_GRANT_ID = 'fldYsJHTikON9gwxh'

type AtRecord = { id: string; fields: Record<string, unknown> }

function getToken(): string {
  const t =
    process.env.Airtable_Personal_Access_Token_2 ||
    process.env.Airtable_Personal_Access_Token ||
    ''
  if (!t.trim()) throw new Error('Missing Airtable personal access token in env')
  return t
}

async function fetchAll(tableId: string): Promise<AtRecord[]> {
  const token = getToken()
  const rows: AtRecord[] = []
  let offset: string | undefined
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.set('returnFieldsByFieldId', 'true')
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Airtable ${tableId}: ${res.status} ${await res.text()}`)
    const data = (await res.json()) as { records: AtRecord[]; offset?: string }
    rows.push(...(data.records || []))
    offset = data.offset
  } while (offset)
  return rows
}

function firstLink(v: unknown): string | null {
  if (Array.isArray(v) && v.length && typeof v[0] === 'string') return v[0]
  return null
}

function formulaText(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.replace(/^"|"$/g, '').trim() || null
  if (typeof v === 'number') return String(v)
  return String(v)
}

async function main() {
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN ===\n')

  const supabase = getSupabaseAdmin()
  const [atGrants, atTransfers, portalGrants, portalTransfers] = await Promise.all([
    fetchAll(GRANTS_TABLE),
    fetchAll(TS_TABLE),
    supabase.from('grants_grid_view').select('id, grant_id, airtable_record_id'),
    supabase.from('transfer_segments').select('id, transfer_id, grant_id, airtable_record_id'),
  ])

  if (portalGrants.error) throw portalGrants.error
  if (portalTransfers.error) throw portalTransfers.error

  const grantIdByAtRec = new Map<string, string>()
  for (const rec of atGrants) {
    const grantId = String(rec.fields[GRANT_ID_FIELD] || '').trim()
    if (!grantId) continue
    grantIdByAtRec.set(rec.id, grantId)
  }
  console.log(`Airtable grants with Grant_ID: ${grantIdByAtRec.size}`)

  const portalByGrantId = new Map(
    (portalGrants.data || [])
      .filter((g) => g.grant_id)
      .map((g) => [g.grant_id as string, g])
  )

  let grantStampPlans = 0
  let grantStampOk = 0
  for (const [atRec, grantId] of grantIdByAtRec) {
    const portal = portalByGrantId.get(grantId)
    if (!portal) continue
    if (portal.airtable_record_id === atRec) continue
    grantStampPlans++
    if (APPLY) {
      const { error } = await supabase
        .from('grants_grid_view')
        .update({ airtable_record_id: atRec })
        .eq('id', portal.id)
      if (error) console.warn(`  grant stamp ${grantId}:`, error.message)
      else grantStampOk++
    }
  }
  console.log(
    `Grant airtable_record_id stamps: ${grantStampPlans}${APPLY ? ` (updated ${grantStampOk})` : ' (dry-run)'}`
  )

  const portalByTransferId = new Map(
    (portalTransfers.data || [])
      .filter((t) => t.transfer_id)
      .map((t) => [t.transfer_id as string, t])
  )
  const portalByAtRec = new Map(
    (portalTransfers.data || [])
      .filter((t) => t.airtable_record_id)
      .map((t) => [t.airtable_record_id as string, t])
  )

  type Plan = {
    id: string
    transfer_id: string
    from: string | null
    to: string
  }
  const plans: Plan[] = []
  let atMissingGrantLink = 0
  let atUnresolvedGrant = 0
  let portalMissing = 0
  let alreadySet = 0

  for (const rec of atTransfers) {
    const transferId = formulaText(rec.fields[TS_TRANSFER_ID])
    if (!transferId || transferId.includes('[object Object]') || transferId === '#ERROR!') {
      continue
    }
    const grantAt = firstLink(rec.fields[TS_GRANT_ID])
    if (!grantAt) {
      atMissingGrantLink++
      continue
    }
    const grantId = grantIdByAtRec.get(grantAt)
    if (!grantId) {
      atUnresolvedGrant++
      continue
    }

    const portal =
      portalByAtRec.get(rec.id) ||
      portalByTransferId.get(transferId) ||
      null
    if (!portal) {
      portalMissing++
      continue
    }
    if (portal.grant_id === grantId) {
      alreadySet++
      continue
    }
    plans.push({
      id: portal.id,
      transfer_id: portal.transfer_id,
      from: portal.grant_id,
      to: grantId,
    })
  }

  console.log(`\nTransfer grant_id updates planned: ${plans.length}`)
  console.log(`  already correct: ${alreadySet}`)
  console.log(`  AT transfer has no grant link: ${atMissingGrantLink}`)
  console.log(`  AT grant link not in Grants table map: ${atUnresolvedGrant}`)
  console.log(`  no matching portal transfer: ${portalMissing}`)
  if (plans.length) {
    const sample = plans.slice(0, 8).map((p) => `${p.transfer_id}: ${p.from ?? 'null'} → ${p.to}`)
    console.log('  sample:', sample)
  }

  if (!APPLY) {
    console.log('\nRe-run with --apply to write.')
    return
  }

  let ok = 0
  for (const plan of plans) {
    const { error } = await supabase
      .from('transfer_segments')
      .update({ grant_id: plan.to, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
    if (error) console.error(`  ${plan.transfer_id}:`, error.message)
    else ok++
  }
  console.log(`\nUpdated transfer_segments.grant_id: ${ok}/${plans.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
