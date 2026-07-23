import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { logComplianceEvent } from '@/lib/complianceAudit'

/**
 * POST /api/compliance/[id]/upload-id
 * Finance uploads a missing ID document for a missing_id flag.
 * Body: { file_key: string } — storage path already uploaded to the images bucket.
 * Saves the key onto err_projects.identity_document_file_key and marks the flag approved.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const perm = await requirePermission('compliance_finance_review')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { file_key, note } = await request.json()

    if (!file_key || typeof file_key !== 'string') {
      return NextResponse.json({ error: 'file_key is required' }, { status: 400 })
    }

    const { data: screening, error: fetchError } = await supabase
      .from('compliance_screenings')
      .select('id, status, flag_type, project_id')
      .eq('id', params.id)
      .single()
    if (fetchError || !screening) {
      return NextResponse.json({ error: 'Screening not found' }, { status: 404 })
    }
    if (screening.status !== 'flagged' || screening.flag_type !== 'missing_id') {
      return NextResponse.json(
        { error: 'ID upload is only allowed for flagged missing_id screenings' },
        { status: 400 }
      )
    }

    const { error: projectError } = await supabase
      .from('err_projects')
      .update({ identity_document_file_key: file_key })
      .eq('id', screening.project_id)
    if (projectError) throw projectError

    const { error: screeningError } = await supabase
      .from('compliance_screenings')
      .update({
        finance_review_status: 'approved',
        finance_review_note: note || 'Identity document uploaded',
        finance_reviewed_by: perm.user.id,
        finance_reviewed_at: new Date().toISOString()
      })
      .eq('id', params.id)
    if (screeningError) throw screeningError

    await logComplianceEvent(supabase, {
      screeningId: screening.id,
      projectId: screening.project_id,
      action: 'upload_id',
      actorId: perm.user.id,
      note: note ? String(note).trim() : 'Identity document uploaded',
      metadata: { file_key }
    })

    return NextResponse.json({
      success: true,
      identity_document_file_key: file_key
    })
  } catch (error) {
    console.error('Error uploading identity document:', error)
    return NextResponse.json({ error: 'Failed to save identity document' }, { status: 500 })
  }
}
