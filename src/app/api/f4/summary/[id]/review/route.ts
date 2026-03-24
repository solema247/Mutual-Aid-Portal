import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { getF4ReviewNotificationRecipients } from '@/lib/f4ReviewNotificationRecipients'

/**
 * PATCH /api/f4/summary/[id]/review
 * Set F4 review status to accepted or rejected (with optional comment).
 * Requires f4_review permission.
 * Creates in-app notifications for F4 uploader, finance team, and responsible ERR.
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

    try {
      const { userIds, errName, projectId } = await getF4ReviewNotificationRecipients(supabase, summaryId)
      const type = status === 'accepted' ? 'f4_review_accepted' : 'f4_review_rejected'
      const title = status === 'accepted' ? 'F4 report accepted' : 'F4 report rejected'
      const context = errName || projectId || `Summary #${summaryId}`
      const bodyText = status === 'rejected' && typeof comment === 'string' && comment.trim()
        ? `${context}. Comment: ${comment.trim().slice(0, 200)}`
        : context
      const link = `/err-portal/f4-f5-reporting?view=${summaryId}`

      if (userIds.length > 0) {
        await supabase.from('user_notifications').insert(
          userIds.map((uid) => ({
            user_id: uid,
            type,
            title,
            body: bodyText,
            link,
            entity_type: 'f4_summary',
            entity_id: String(summaryId)
          }))
        )
      }
    } catch (notifErr) {
      console.error('F4 review notifications error', notifErr)
    }

    return NextResponse.json({ success: true, review_status: status })
  } catch (e) {
    console.error('F4 review PATCH error', e)
    return NextResponse.json({ error: 'Failed to update review status' }, { status: 500 })
  }
}
