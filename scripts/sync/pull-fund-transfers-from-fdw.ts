/**
 * Pull latest Airtable FDW fund_request files into portal transfer_segments.
 *
 *   npx tsx scripts/sync/pull-fund-transfers-from-fdw.ts           # dry-run
 *   npx tsx scripts/sync/pull-fund-transfers-from-fdw.ts --apply
 *
 * Airtable stores the document on Fund_Request, not Transfer_Segment.
 * This copies that file onto portal transfer_segments that do not yet have one.
 * Existing portal uploads (file_link already set) are left alone.
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

function jsonbToText(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const t = value.trim().replace(/^"|"$/g, '')
    if (!t || t.includes('#ERROR!')) return null
    return t
  }
  if (Array.isArray(value)) return value.length ? jsonbToText(value[0]) : null
  if (typeof value === 'object') {
    if ('error' in (value as object)) return null
    return jsonbToText(Object.values(value as object)[0])
  }
  const s = String(value).trim()
  return s && !s.includes('#ERROR!') ? s : null
}

async function fetchAll(
  table: string,
  select: string
): Promise<Record<string, unknown>[]> {
  const supabase = getSupabaseAdmin()
  const rows: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

async function main() {
  console.log(APPLY ? '=== APPLY ===\n' : '=== DRY RUN ===\n')
  const supabase = getSupabaseAdmin()

  const [fdwFr, portalFr, fdwTs, portalTs] = await Promise.all([
    fetchAll('fund_request', 'request_id, file_name, file_link'),
    fetchAll('fund_requests', 'id, request_id, file_name, file_link'),
    fetchAll('transfer_segment', 'auto, request_id'),
    fetchAll(
      'transfer_segments',
      'id, transfer_id, auto_number, fund_request_id, file_name, file_link'
    ),
  ])

  const portalFrById = new Map(portalFr.map((r) => [String(r.request_id || '').trim(), r]))

  const frFileUpdates: Array<{
    id: string
    request_id: string
    file_name: string | null
    file_link: string | null
  }> = []
  for (const f of fdwFr) {
    const key = jsonbToText(f.request_id) || String(f.request_id || '').trim()
    if (!key) continue
    const p = portalFrById.get(key)
    if (!p) continue
    const file_name =
      jsonbToText(f.file_name) || (typeof f.file_name === 'string' ? f.file_name : null)
    const file_link =
      jsonbToText(f.file_link) || (typeof f.file_link === 'string' ? f.file_link : null)
    if (!file_link) continue
    if (p.file_link === file_link && (p.file_name || null) === (file_name || null)) continue
    frFileUpdates.push({
      id: p.id as string,
      request_id: key,
      file_name,
      file_link,
    })
  }

  const portalAutos = new Set(
    portalTs
      .map((t) => (t.auto_number != null ? Number(t.auto_number) : NaN))
      .filter((n) => Number.isFinite(n))
  )
  const fdwOnlyAutos: number[] = []
  for (const f of fdwTs) {
    const auto = f.auto != null ? Number(f.auto) : NaN
    if (!Number.isFinite(auto)) continue
    if (!portalAutos.has(auto)) fdwOnlyAutos.push(auto)
  }

  const fileCopy: Array<{
    id: string
    transfer_id: string
    file_name: string | null
    file_link: string
  }> = []
  for (const t of portalTs) {
    if (t.file_link) continue
    const fr = portalFr.find((r) => r.id === t.fund_request_id)
    const pendingFr = frFileUpdates.find((u) => u.id === (t.fund_request_id as string))
    const file_link = pendingFr?.file_link || (fr?.file_link as string | null)
    const file_name = pendingFr?.file_name || (fr?.file_name as string | null)
    if (!file_link) continue
    fileCopy.push({
      id: t.id as string,
      transfer_id: t.transfer_id as string,
      file_name,
      file_link,
    })
  }

  console.log(`Fund request file updates from FDW: ${frFileUpdates.length}`)
  for (const u of frFileUpdates.slice(0, 10)) {
    console.log(`  ${u.request_id}: ${u.file_name || '(unnamed)'}`)
  }
  if (frFileUpdates.length > 10) console.log(`  … ${frFileUpdates.length - 10} more`)

  console.log(`\nCopy fund-request file onto transfers with no file: ${fileCopy.length}`)
  if (fdwOnlyAutos.length) {
    console.log(
      `\nFDW-only transfer auto# (not imported — request_id is an Airtable rec id / null): ${fdwOnlyAutos.join(', ')}`
    )
  }

  if (!APPLY) {
    console.log('\nNo changes written. Re-run with --apply to execute.')
    return
  }

  let frOk = 0
  for (const u of frFileUpdates) {
    const { error } = await supabase
      .from('fund_requests')
      .update({
        file_name: u.file_name,
        file_link: u.file_link,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)
    if (error) console.error(`FR ${u.request_id}:`, error.message)
    else frOk++
  }

  let copyOk = 0
  for (const u of fileCopy) {
    const { error } = await supabase
      .from('transfer_segments')
      .update({
        file_name: u.file_name,
        file_link: u.file_link,
        updated_at: new Date().toISOString(),
      })
      .eq('id', u.id)
      .is('file_link', null)
    if (error) console.error(`File copy ${u.transfer_id}:`, error.message)
    else copyOk++
  }

  console.log(`\nApplied: FR files ${frOk}, transfer file copies ${copyOk}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
