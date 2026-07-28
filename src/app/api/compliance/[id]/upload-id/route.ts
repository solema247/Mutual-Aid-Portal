import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

/**
 * POST /api/compliance/[id]/upload-id
 * Finance uploads a missing ID document for a missing_id flag.
 * Body: { file_key: string } — storage path already uploaded to the images bucket.
 *
 * Saves the key onto err_projects.identity_document_file_key and returns the
 * screening to Ahmed's compliance queue (finance_review_status = id_uploaded).
 * Does NOT auto-approve into History — Ahmed must Clear after reviewing the ID.
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

    const trimmedNote = note ? String(note).trim() : ''
    const { error: screeningError } = await supabase
      .from('compliance_screenings')
      .update({
        // Stay flagged/missing_id so commit remains blocked, but mark finance's
        // step done so the row returns to Ahmed's screening queue for Clear.
        finance_review_status: 'id_uploaded',
        finance_review_note:
          trimmedNote || 'Identity document uploaded — awaiting compliance clearance',
        finance_reviewed_by: perm.user.id,
        finance_reviewed_at: new Date().toISOString()
      })
      .eq('id', params.id)
    if (screeningError) throw screeningError

    return NextResponse.json({
      success: true,
      identity_document_file_key: file_key,
      awaiting_compliance_clearance: true
    })
  } catch (error) {
    console.error('Error uploading identity document:', error)
    return NextResponse.json({ error: 'Failed to save identity document' }, { status: 500 })
  }
}
