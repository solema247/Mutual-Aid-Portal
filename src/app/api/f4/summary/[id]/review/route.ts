import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

/**
 * PATCH /api/f4/summary/[id]/review
 * Set F4 review status to accepted or rejected (with optional comment).
 * Requires f4_review permission.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const perm = await requirePermission('f4_review')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const summaryId = Number(params.id)
    if (!summaryId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { data: summaryRow } = await supabase
      .from('err_summary')
      .select('activities_raw_import_id')
      .eq('id', summaryId)
      .maybeSingle()
    if (summaryRow?.activities_raw_import_id) {
      return NextResponse.json(
        { error: 'Review is not available for F4 reports linked to historical tracker data' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { status, comment } = body || {}
    if (!status || !['accepted', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'status must be accepted or rejected' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser()
    const userId = user?.id
    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', userId)
      .single()

    const { error } = await supabase
      .from('err_summary')
      .update({
        review_status: status,
        review_comment: typeof comment === 'string' ? comment : null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userRow?.id || null
      })
      .eq('id', summaryId)

    if (error) throw error

    return NextResponse.json({ success: true, review_status: status })
  } catch (e) {
    console.error('F4 review PATCH error', e)
    return NextResponse.json({ error: 'Failed to update review status' }, { status: 500 })
  }
}
