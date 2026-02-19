import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

const ALLOWED_F4 = ['waiting', 'partial', 'in review', 'completed'] as const
const ALLOWED_F5 = ['waiting', 'partial', 'in review', 'completed'] as const

function normalizeStatus(value: unknown, allowed: readonly string[]): string | null {
  if (value == null || value === '') return null
  const s = String(value).trim().toLowerCase()
  if (allowed.includes(s)) return s
  if (s === 'under review') return 'in review'
  return null
}

/**
 * PATCH /api/projects/[id]/reporting-status
 * Body: { f4_status?: 'waiting' | 'partial' | 'in review' | 'completed', f5_status?: same }
 * Only for portal projects (not historical). Updates err_projects.f4_status and/or f5_status.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: projectId } = await params
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }
    if (projectId.startsWith('historical_')) {
      return NextResponse.json({ error: 'Cannot update reporting status for historical projects.' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const f4_status = normalizeStatus(body.f4_status, ALLOWED_F4)
    const f5_status = normalizeStatus(body.f5_status, ALLOWED_F5)

    if (f4_status === null && f5_status === null) {
      return NextResponse.json({ error: 'Provide at least one of f4_status or f5_status.' }, { status: 400 })
    }

    const update: Record<string, string> = {}
    if (f4_status !== null) update.f4_status = f4_status
    if (f5_status !== null) update.f5_status = f5_status

    const { error } = await supabase
      .from('err_projects')
      .update(update)
      .eq('id', projectId)

    if (error) {
      console.error('Error updating reporting status:', error)
      return NextResponse.json({ error: 'Failed to update reporting status' }, { status: 500 })
    }

    return NextResponse.json({ success: true, ...update })
  } catch (e) {
    console.error('PATCH /api/projects/[id]/reporting-status:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
