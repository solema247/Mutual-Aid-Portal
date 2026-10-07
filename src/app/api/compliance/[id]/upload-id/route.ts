import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { assertProjectInRoomAccess } from '@/lib/userRoomAccess'
import { sendIdUploadedAlert } from '@/lib/complianceAlerts'
import { isPreJulyProject } from '@/lib/compliance'

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
    const actorLogin = perm.user.email?.trim()
    if (!actorLogin) {
      return NextResponse.json({ error: 'Logged-in user has no email/login' }, { status: 400 })
    }

    const supabase = getSupabaseRouteClient()
    const { file_key, note } = await request.json()

    if (!file_key || typeof file_key !== 'string') {
      return NextResponse.json({ error: 'file_key is required' }, { status: 400 })
    }

    const { data: screening, error: fetchError } = await supabase
      .from('compliance_screenings')
      .select(`
        id, status, flag_type, project_id, screened_by, names,
        err_projects ( err_id, submitted_at, date )
      `)
      .eq('id', params.id)
      .single()
    if (fetchError || !screening) {
      return NextResponse.json({ error: 'Screening not found' }, { status: 404 })
    }

    // Base ERR may only act on screenings for projects in its own emergency room
    const roomCheck = await assertProjectInRoomAccess(String(screening.project_id), undefined, {
      notFoundMessage: 'Screening not found',
    })
    if (roomCheck.handled && !roomCheck.ok) return roomCheck.response

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
        finance_reviewed_by: actorLogin,
        finance_reviewed_at: new Date().toISOString()
      })
      .eq('id', params.id)
    if (screeningError) throw screeningError

    type ProjectRef = { err_id?: string | null; submitted_at?: string | null; date?: string | null }
    const rawProject = screening.err_projects as ProjectRef | ProjectRef[] | null
    const project = Array.isArray(rawProject) ? rawProject[0] : rawProject

    // F1s raised before 1 Jul 2026 are outside system screening — never alert Slack for them.
    const alert =
      project && isPreJulyProject(project)
        ? { detail: 'Raised before 1 Jul 2026 — no Slack alert' }
        : await sendIdUploadedAlert({
            errId: project?.err_id || null,
            projectId: screening.project_id,
            screeningId: screening.id,
            names: Array.isArray(screening.names) ? screening.names : [],
            screenedByLogin: screening.screened_by || null,
            uploadedByLogin: actorLogin,
            note: trimmedNote || null
          })

    return NextResponse.json({
      success: true,
      identity_document_file_key: file_key,
      awaiting_compliance_clearance: true,
      alert: alert.detail
    })
  } catch (error) {
    console.error('Error uploading identity document:', error)
    return NextResponse.json({ error: 'Failed to save identity document' }, { status: 500 })
  }
}
