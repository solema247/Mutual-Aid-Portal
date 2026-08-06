/**
 * One-time backfill: Airtable Fund_Request + Transfer_Segment → portal tables.
 *
 *   npx tsx scripts/sync/backfill-fund-requests-transfers.ts           # dry-run
 *   npx tsx scripts/sync/backfill-fund-requests-transfers.ts --apply
 *
 * Requires: fsps, fund_requests, fund_request_decisions, transfer_segments
 * Env: Airtable_Personal_Access_Token or Airtable_Personal_Access_Token_2
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { AIRTABLE_BASE_ID } from '../../src/lib/airtable/config'
import {
  normalizeTransferStatus,
  parseMoney,
} from '../../src/lib/grantManagement/fundTransferHelpers'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

const FR_TABLE = 'tblaE8Q9hwv4WtUYi'
const TS_TABLE = 'tbl5yeqArFbIQdzC8'
const FSP_TABLE = 'tblPDugkSk6DL7UaW'

const FR_FIELDS = {
  requestId: 'fld5zvepLTRSXy3F2',
  dateSubmitted: 'fldSZbVQjJxb9D56r',
  decisionId: 'fldsSFNtr0jkFGC4Z',
  requestedAmount: 'fldLHQxoidN6jpiKh',
  fileName: 'fldwOpmGSJAAHGzGl',
  fileLink: 'fldMBmrZqeY5JYxXB',
  partnerName: 'fld23OthVSIfnxSiR',
} as const

const TS_FIELDS = {
  transferId: 'fldIiXcn4lXwizbIg',
  requestId: 'fldpmVqTnAPUKGiSj',
  grantId: 'fldYsJHTikON9gwxh',
  receivedDate: 'fldFqC9nE7hcvFADD',
  purpose: 'fld2GE3fYPSdzClhR',
  status: 'fldSA4hkQumJEXDAF',
  decisionId: 'fldkOzw0J8IJ09Vvh',
  activity: 'fldRM93kgXVeNiqE3',
  fee: 'fldD7LalmhJF9IHEq',
  partner: 'fldQiIAWsJuiy05Zb',
  comment: 'fldN1qJgIRrsavM2W',
  auto: 'fldVFzABwehwuYdUx',
  fsps: 'fldKs3AbZXbfzVD9j',
} as const

const FSP_FIELDS = {
  name: 'fldaWhbkCdoy8ladn',
} as const

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
    // Field ids as keys (fld…) so FR_FIELDS / TS_FIELDS lookups work
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

function allLinks(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
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
  const [frRows, tsRows, fspAt, decisions, grants, fsps] = await Promise.all([
    fetchAll(FR_TABLE),
    fetchAll(TS_TABLE),
    fetchAll(FSP_TABLE),
    supabase.from('distribution_decision_master_sheet_1').select('decision_id_proposed, airtable_record_id'),
    supabase.from('grants_grid_view').select('grant_id, airtable_record_id'),
    supabase.from('fsps').select('id, name, airtable_record_id'),
  ])

  if (fsps.error) throw new Error(`fsps table missing? ${fsps.error.message}`)
  if (decisions.error) throw decisions.error
  if (grants.error) throw grants.error

  const fspByAtId = new Map<string, { id: string; name: string }>()
  const fspByName = new Map<string, { id: string; name: string }>()
  for (const f of fsps.data || []) {
    if (f.airtable_record_id) fspByAtId.set(f.airtable_record_id, f)
    fspByName.set(f.name.toLowerCase(), f)
  }
  for (const rec of fspAt) {
    const name = String(rec.fields[FSP_FIELDS.name] || '').trim()
    if (!name) continue
    const existing = fspByName.get(name.toLowerCase())
    if (existing) {
      fspByAtId.set(rec.id, existing)
      if (APPLY && !existing) {
        /* noop */
      }
      if (APPLY) {
        await supabase.from('fsps').update({ airtable_record_id: rec.id }).eq('id', existing.id)
      }
    }
  }

  const decisionByAt = new Map<string, string>()
  for (const d of decisions.data || []) {
    if (d.airtable_record_id && d.decision_id_proposed) {
      decisionByAt.set(d.airtable_record_id, d.decision_id_proposed)
    }
  }

  // Partner names: resolve via linked record ids is hard without Partners table;
  // leave partner_name null or use grant_id text later.
  console.log(`AT fund requests: ${frRows.length}`)
  console.log(`AT transfer segments: ${tsRows.length}`)
  console.log(`Portal FSPs: ${(fsps.data || []).length}`)

  type FrPlan = {
    airtable_record_id: string
    request_id: string
    date_submitted: string | null
    requested_amount: number | null
    file_name: string | null
    file_link: string | null
    decision_at_ids: string[]
  }

  const frPlans: FrPlan[] = []
  for (const rec of frRows) {
    const f = rec.fields
    const request_id = String(f[FR_FIELDS.requestId] || '').trim()
    if (!request_id) continue
    frPlans.push({
      airtable_record_id: rec.id,
      request_id,
      date_submitted: (f[FR_FIELDS.dateSubmitted] as string) || null,
      requested_amount: parseMoney(f[FR_FIELDS.requestedAmount]),
      file_name: (f[FR_FIELDS.fileName] as string) || null,
      file_link: (f[FR_FIELDS.fileLink] as string) || null,
      decision_at_ids: allLinks(f[FR_FIELDS.decisionId]),
    })
  }

  console.log(`\nFund requests to upsert: ${frPlans.length}`)
  if (!APPLY) {
    console.log('Sample:', frPlans.slice(0, 3))
    console.log(`Transfers to upsert: ${tsRows.length}`)
    console.log('Re-run with --apply to write.')
    return
  }

  const frIdByAt = new Map<string, string>()
  const frIdByRequestId = new Map<string, string>()
  let frOk = 0
  for (const plan of frPlans) {
    const { data, error } = await supabase
      .from('fund_requests')
      .upsert(
        {
          request_id: plan.request_id,
          date_submitted: plan.date_submitted,
          requested_amount: plan.requested_amount,
          file_name: plan.file_name,
          file_link: plan.file_link,
          airtable_record_id: plan.airtable_record_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'request_id' }
      )
      .select('id, request_id')
      .single()
    if (error) {
      console.error(`FR ${plan.request_id}:`, error.message)
      continue
    }
    frOk++
    frIdByAt.set(plan.airtable_record_id, data.id)
    frIdByRequestId.set(data.request_id, data.id)

    await supabase.from('fund_request_decisions').delete().eq('fund_request_id', data.id)
    const decisionKeys = plan.decision_at_ids
      .map((rid) => decisionByAt.get(rid))
      .filter((x): x is string => Boolean(x))
    if (decisionKeys.length) {
      const { error: linkErr } = await supabase.from('fund_request_decisions').insert(
        decisionKeys.map((decision_id_proposed) => ({
          fund_request_id: data.id,
          decision_id_proposed,
        }))
      )
      if (linkErr) console.warn(`  decisions link ${plan.request_id}:`, linkErr.message)
    }
  }
  console.log(`Fund requests upserted: ${frOk}`)

  // Refresh grant map by grant_id business key from AT Grants link is complex;
  // Transfer Grant_ID is link to Grants — resolve via grants_grid_view.airtable_record_id when present.
  const grantByAt = new Map<string, string>()
  for (const g of grants.data || []) {
    if (g.airtable_record_id && g.grant_id) grantByAt.set(g.airtable_record_id, g.grant_id)
  }

  let tsOk = 0
  for (const rec of tsRows) {
    const f = rec.fields
    const transfer_id = formulaText(f[TS_FIELDS.transferId])
    if (!transfer_id || transfer_id.includes('[object Object]') || transfer_id === '#ERROR!') {
      continue
    }
    const frAt = firstLink(f[TS_FIELDS.requestId])
    const fund_request_id = frAt ? frIdByAt.get(frAt) || null : null
    const grantAt = firstLink(f[TS_FIELDS.grantId])
    const grant_id = grantAt ? grantByAt.get(grantAt) || null : null
    const fspAtId = firstLink(f[TS_FIELDS.fsps])
    const fsp = fspAtId ? fspByAtId.get(fspAtId) : null
    const decisionAt = firstLink(f[TS_FIELDS.decisionId])
    const decision_id_proposed = decisionAt ? decisionByAt.get(decisionAt) || null : null

    const { error } = await supabase.from('transfer_segments').upsert(
      {
        transfer_id,
        auto_number: typeof f[TS_FIELDS.auto] === 'number' ? f[TS_FIELDS.auto] : null,
        fund_request_id,
        request_id: fund_request_id
          ? frPlans.find((p) => p.airtable_record_id === frAt)?.request_id || null
          : null,
        grant_id,
        fsp_id: fsp?.id || null,
        decision_id_proposed,
        purpose: (f[TS_FIELDS.purpose] as string) || null,
        status: normalizeTransferStatus(f[TS_FIELDS.status] as string),
        activity_amount: parseMoney(f[TS_FIELDS.activity]),
        transfer_fee_amount: parseMoney(f[TS_FIELDS.fee]),
        transfer_received_date: (f[TS_FIELDS.receivedDate] as string) || null,
        comment: (f[TS_FIELDS.comment] as string) || null,
        airtable_record_id: rec.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'transfer_id' }
    )
    if (error) {
      console.error(`TS ${transfer_id}:`, error.message)
    } else {
      tsOk++
    }
  }
  console.log(`Transfer segments upserted: ${tsOk}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
