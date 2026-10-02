import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { emitF123Audit } from '@/lib/f123Audit'

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
      .select('project_id, activities_raw_import_id, review_status, review_comment')
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

    const reviewComment = typeof comment === 'string' ? comment : null
    const reviewedAt = new Date().toISOString()

    const { error } = await supabase
      .from('err_summary')
      .update({
        review_status: status,
        review_comment: reviewComment,
        reviewed_at: reviewedAt,
        reviewed_by: userRow?.id || null
      })
      .eq('id', summaryId)

    if (error) throw error

    const projectId = summaryRow?.project_id ? String(summaryRow.project_id) : null
    await emitF123Audit({
      action: 'f4.reviewed',
      actorUserId: perm.user.id,
      endpoint: 'PATCH /api/f4/summary/[id]/review',
      request,
      targetType: 'f4_summary',
      targetId: projectId,
      oldValues: {
        review_status: summaryRow?.review_status ?? null,
        review_comment: summaryRow?.review_comment ?? null,
      },
      newValues: {
        review_status: status,
        review_comment: reviewComment,
      },
      metadata: {
        project_id: projectId,
        summary_id: summaryId,
        reviewed_at: reviewedAt,
      },
    })

    return NextResponse.json({ success: true, review_status: status })
  } catch (e) {
    console.error('F4 review PATCH error', e)
    return NextResponse.json({ error: 'Failed to update review status' }, { status: 500 })
  }
}
