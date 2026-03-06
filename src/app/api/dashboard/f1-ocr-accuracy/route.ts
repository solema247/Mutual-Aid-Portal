import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/** Max edited fields to count as "accepted" (minimal edits). 0 = as-is only. */
const ACCEPTED_EDIT_THRESHOLD = 2

export type F1OcrAccuracyResponse = {
  total_with_ocr: number
  accepted_count: number
  accuracy_percent: number
  by_state?: { state: string; total: number; accepted: number; percent: number }[]
}

/**
 * GET /api/dashboard/f1-ocr-accuracy
 * Returns F1 OCR acceptance metric: share of F1 uploads (with OCR) accepted with no or minimal edits.
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()

    let query = supabase
      .from('err_projects')
      .select('state, ocr_edited_fields_count')
      .not('ocr_edited_fields_count', 'is', null)

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      query = query.in('state', allowedStateNames)
    }

    const { data: rows, error } = await query
    if (error) throw error

    const total_with_ocr = (rows || []).length
    const accepted_count = (rows || []).filter(
      (r: any) =>
        r.ocr_edited_fields_count != null &&
        Number(r.ocr_edited_fields_count) <= ACCEPTED_EDIT_THRESHOLD
    ).length
    const accuracy_percent =
      total_with_ocr > 0 ? Math.round((accepted_count / total_with_ocr) * 100) : 0

    const byState: { state: string; total: number; accepted: number; percent: number }[] = []
    const stateMap = new Map<string, { total: number; accepted: number }>()
    for (const r of rows || []) {
      const state = (r as any).state ?? 'Unknown'
      const curr = stateMap.get(state) ?? { total: 0, accepted: 0 }
      curr.total += 1
      const count = Number((r as any).ocr_edited_fields_count)
      if (!Number.isNaN(count) && count <= ACCEPTED_EDIT_THRESHOLD) curr.accepted += 1
      stateMap.set(state, curr)
    }
    for (const [state, v] of stateMap) {
      byState.push({
        state,
        total: v.total,
        accepted: v.accepted,
        percent: v.total > 0 ? Math.round((v.accepted / v.total) * 100) : 0
      })
    }
    byState.sort((a, b) => a.state.localeCompare(b.state))

    const body: F1OcrAccuracyResponse = {
      total_with_ocr,
      accepted_count,
      accuracy_percent,
      by_state: byState.length ? byState : undefined
    }

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    })
  } catch (error) {
    console.error('Dashboard f1-ocr-accuracy error:', error)
    return NextResponse.json(
      { error: 'Failed to load F1 OCR accuracy' },
      { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    )
  }
}
