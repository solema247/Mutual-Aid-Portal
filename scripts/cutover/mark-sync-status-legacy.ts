/**
 * Mark backfilled canonical rows as sync_status = 'legacy'.
 *
 * Backfill left every row as `pending`, which wrongly implies an outbox backlog.
 * `legacy` = already represented in Airtable display tables; no Portal_* push until
 * the row is edited in the portal (API then sets `pending`).
 *
 *   npx tsx scripts/cutover/mark-sync-status-legacy.ts
 *   npx tsx scripts/cutover/mark-sync-status-legacy.ts --apply
 *   npx tsx scripts/cutover/mark-sync-status-legacy.ts --apply --keep-pending-after=2026-07-01T00:00:00Z
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { SYNC_STATUS } from '../../src/lib/grantManagement/syncStatus'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

const keepAfterArg = process.argv.find((a) => a.startsWith('--keep-pending-after='))
const keepPendingAfter = keepAfterArg
  ? new Date(keepAfterArg.split('=')[1] ?? '')
  : null

if (keepAfterArg && (!keepPendingAfter || Number.isNaN(keepPendingAfter.getTime()))) {
  console.error('Invalid --keep-pending-after= value (use ISO timestamp)')
  process.exit(1)
}

type RowWithStatus = { sync_status: string; created_at?: string | null }
type AllocationRow = { Allocation_ID: string; sync_status: string }

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const supabase = getSupabaseAdmin()
  const rows: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...(data as T[]))
    if (data.length < 1000) break
    from += 1000
  }
  return rows
}

function countByStatus(rows: { sync_status: string }[]) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    counts[row.sync_status] = (counts[row.sync_status] ?? 0) + 1
  }
  return counts
}

function shouldMarkLegacy(row: RowWithStatus): boolean {
  if (row.sync_status !== SYNC_STATUS.PENDING) return false
  if (!keepPendingAfter) return true
  if (!row.created_at) return true
  return new Date(row.created_at) <= keepPendingAfter
}

async function updateTable(
  table: 'grants_grid_view' | 'distribution_decision_master_sheet_1' | 'allocations_by_date',
  idColumn: string,
  ids: string[]
): Promise<number> {
  if (!ids.length) return 0
  const supabase = getSupabaseAdmin()
  let updated = 0
  const batchSize = 100
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize)
    const { error } = await supabase
      .from(table)
      .update({ sync_status: SYNC_STATUS.LEGACY })
      .in(idColumn, batch)
    if (error) throw error
    updated += batch.length
  }
  return updated
}

async function main() {
  const [grants, decisions, allocations] = await Promise.all([
    fetchAll<{ id: string; sync_status: string; created_at: string | null }>(
      'grants_grid_view',
      'id, sync_status, created_at'
    ),
    fetchAll<{ id: string; sync_status: string; created_at: string | null }>(
      'distribution_decision_master_sheet_1',
      'id, sync_status, created_at'
    ),
    fetchAll<AllocationRow>('allocations_by_date', 'Allocation_ID, sync_status'),
  ])

  console.log('=== sync_status before ===')
  console.log('grants_grid_view:', countByStatus(grants))
  console.log('distribution_decision_master_sheet_1:', countByStatus(decisions))
  console.log('allocations_by_date:', countByStatus(allocations))
  console.log()

  const grantIds = grants.filter(shouldMarkLegacy).map((r) => r.id)
  const decisionIds = decisions.filter(shouldMarkLegacy).map((r) => r.id)
  const allocationIds = allocations
    .filter((r) => r.sync_status === SYNC_STATUS.PENDING)
    .map((r) => r.Allocation_ID)

  if (keepPendingAfter) {
    console.log(
      `--keep-pending-after=${keepPendingAfter.toISOString()} (grants/decisions only; allocations have no created_at)`
    )
    console.log()
  }

  console.log('=== would mark legacy (from pending) ===')
  console.log(`grants_grid_view: ${grantIds.length}`)
  console.log(`distribution_decision_master_sheet_1: ${decisionIds.length}`)
  console.log(`allocations_by_date: ${allocationIds.length}`)
  console.log()

  const skippedGrants = grants.filter(
    (r) => r.sync_status === SYNC_STATUS.PENDING && !shouldMarkLegacy(r)
  ).length
  const skippedDecisions = decisions.filter(
    (r) => r.sync_status === SYNC_STATUS.PENDING && !shouldMarkLegacy(r)
  ).length
  if (skippedGrants || skippedDecisions) {
    console.log(
      `Keeping pending (created after cutoff): grants=${skippedGrants}, decisions=${skippedDecisions}`
    )
    console.log()
  }

  if (!APPLY) {
    console.log('No changes written. Re-run with --apply to execute.')
    return
  }

  const [g, d, a] = await Promise.all([
    updateTable('grants_grid_view', 'id', grantIds),
    updateTable('distribution_decision_master_sheet_1', 'id', decisionIds),
    updateTable('allocations_by_date', 'Allocation_ID', allocationIds),
  ])

  console.log(`Applied: grants=${g}, decisions=${d}, allocations=${a}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
