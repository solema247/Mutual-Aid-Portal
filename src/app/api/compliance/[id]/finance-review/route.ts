import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

/**
 * POST /api/compliance/[id]/finance-review
 *
 * Actions:
 *  - dismiss  — flag raised erroneously; clear the flag and unblock
 *  - approve  — only for missing_id after an ID has been uploaded (or legacy flags)
 *  - reject   — legacy alias for dismiss
 *
 * For sanctions_match, finance cannot "approve" a payment — only dismiss if erroneous.
 * For missing_id, use upload-id endpoint to attach the ID and resolve.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const perm = await requirePermission('compliance_finance_review')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { action, note } = await request.json()

    const normalized =
      action === 'reject' || action === 'dismiss'
        ? 'dismiss'
        : action === 'approve'
          ? 'approve'
          : null

    if (!normalized) {
      return NextResponse.json(
        { error: "action must be 'dismiss' (or 'reject') or 'approve'" },
        { status: 400 }
      )
    }

    const { data: screening, error: fetchError } = await supabase
      .from('compliance_screenings')
      .select('id, status, flag_type, finance_review_status, project_id')
      .eq('id', params.id)
      .single()
    if (fetchError || !screening) {
      return NextResponse.json({ error: 'Screening not found' }, { status: 404 })
    }
    if (screening.status !== 'flagged') {
      return NextResponse.json(
        { error: 'Only flagged screenings can be finance-reviewed' },
        { status: 400 }
      )
    }

    if (normalized === 'approve') {
      if (screening.flag_type === 'sanctions_match') {
        return NextResponse.json(
          {
            error:
              'Sanctions-match flags cannot be approved for payment. Dismiss only if the flag was raised in error, otherwise the payment must remain stopped.'
          },
          { status: 400 }
        )
      }
      if (screening.flag_type === 'missing_id') {
        // ID must already be on the project (uploaded via upload-id)
        const { data: project } = await supabase
          .from('err_projects')
          .select('identity_document_file_key')
          .eq('id', screening.project_id)
          .single()
        if (!project?.identity_document_file_key) {
          return NextResponse.json(
            { error: 'Upload the missing ID document before approving this flag' },
            { status: 400 }
          )
        }
      }
    }

    if (normalized === 'dismiss') {
      // Erroneous flag — return to pending so finance can re-screen if needed,
      // and unblock commit
      const { error: updateError } = await supabase
        .from('compliance_screenings')
        .update({
          status: 'pending_screening',
          flag_type: null,
          flag_note: null,
          finance_review_status: 'rejected',
          finance_review_note: note
            ? `Flag dismissed as erroneous: ${note}`
            : 'Flag dismissed as erroneous',
          finance_reviewed_by: perm.user.id,
          finance_reviewed_at: new Date().toISOString()
        })
        .eq('id', params.id)
      if (updateError) throw updateError
      return NextResponse.json({ success: true, action: 'dismissed' })
    }

    // approve (missing_id with ID already uploaded, or legacy)
    const { error: updateError } = await supabase
      .from('compliance_screenings')
      .update({
        finance_review_status: 'approved',
        finance_review_note: note || null,
        finance_reviewed_by: perm.user.id,
        finance_reviewed_at: new Date().toISOString()
      })
      .eq('id', params.id)
    if (updateError) throw updateError

    return NextResponse.json({ success: true, action: 'approved' })
  } catch (error) {
    console.error('Error recording finance review:', error)
    return NextResponse.json({ error: 'Failed to record finance review' }, { status: 500 })
  }
}
