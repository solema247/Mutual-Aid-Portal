import { NextResponse } from 'next/server'
import { isAirtablePushConfigured } from '@/lib/airtable/config'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import {
  syncAllocationToAirtable,
  syncDecisionToAirtable,
  syncGrantToAirtable,
} from '@/lib/grantManagement/pushToAirtable'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'

const LIMIT = 50

/**
 * POST /api/airtable/push-retry — drain pending/failed Portal_* pushes (editor only).
 */
export async function POST() {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  if (!isAirtablePushConfigured()) {
    return NextResponse.json({ error: 'Airtable push is not configured' }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()
  const results = {
    grants: { attempted: 0, synced: 0, failed: 0 },
    decisions: { attempted: 0, synced: 0, failed: 0 },
    allocations: { attempted: 0, synced: 0, failed: 0 },
    errors: [] as string[],
  }

  try {
    const { data: grants } = await supabase
      .from('grants_grid_view')
      .select('id')
      .in('sync_status', [SYNC_STATUS.PENDING, SYNC_STATUS.FAILED])
      .limit(LIMIT)

    for (const row of grants ?? []) {
      results.grants.attempted++
      const outcome = await syncGrantToAirtable(supabase, row.id)
      if (outcome.status === 'synced') results.grants.synced++
      else {
        results.grants.failed++
        if (outcome.error) results.errors.push(`grant ${row.id}: ${outcome.error}`)
      }
    }

    const { data: decisions } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('id')
      .in('sync_status', [SYNC_STATUS.PENDING, SYNC_STATUS.FAILED])
      .limit(LIMIT)

    for (const row of decisions ?? []) {
      results.decisions.attempted++
      const outcome = await syncDecisionToAirtable(supabase, row.id)
      if (outcome.status === 'synced') results.decisions.synced++
      else {
        results.decisions.failed++
        if (outcome.error) results.errors.push(`decision ${row.id}: ${outcome.error}`)
      }
    }

    const { data: allocations } = await supabase
      .from('allocations_by_date')
      .select('Allocation_ID')
      .in('sync_status', [SYNC_STATUS.PENDING, SYNC_STATUS.FAILED])
      .limit(LIMIT)

    for (const row of allocations ?? []) {
      results.allocations.attempted++
      const outcome = await syncAllocationToAirtable(supabase, row.Allocation_ID)
      if (outcome.status === 'synced') results.allocations.synced++
      else {
        results.allocations.failed++
        if (outcome.error) {
          results.errors.push(`allocation ${row.Allocation_ID}: ${outcome.error}`)
        }
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    console.error('push-retry error:', error)
    return NextResponse.json({ error: 'Push retry failed' }, { status: 500 })
  }
}
