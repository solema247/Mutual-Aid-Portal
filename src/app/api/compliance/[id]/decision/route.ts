import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { normalizedNameKey, type FlagType } from '@/lib/compliance'
import { sendSanctionsMatchAlert } from '@/lib/complianceAlerts'

const VALID_FLAG_TYPES: FlagType[] = ['missing_id', 'sanctions_match']

// POST /api/compliance/[id]/decision - Record a screening decision (clear or flag).
// Flag requires flag_type: missing_id | sanctions_match
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const perm = await requirePermission('compliance_screen')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { action, note, flag_type } = await request.json()

    if (action !== 'clear' && action !== 'flag') {
      return NextResponse.json({ error: "action must be 'clear' or 'flag'" }, { status: 400 })
    }

    if (action === 'flag') {
      if (!flag_type || !VALID_FLAG_TYPES.includes(flag_type)) {
        return NextResponse.json(
          { error: "flag_type is required: 'missing_id' or 'sanctions_match'" },
          { status: 400 }
        )
      }
      if (!note || !String(note).trim()) {
        return NextResponse.json({ error: 'A note is required when flagging' }, { status: 400 })
      }
    }

    const { data: screening, error: fetchError } = await supabase
      .from('compliance_screenings')
      .select(`
        id, names, status, project_id,
        err_projects ( err_id )
      `)
      .eq('id', params.id)
      .single()
    if (fetchError || !screening) {
      return NextResponse.json({ error: 'Screening not found' }, { status: 404 })
    }

    // On clear, the note is an optional caveat/comment (e.g. "Cleared but no
    // account number included"); on flag it's the required reason. Either way
    // we persist it in flag_note so the queue/history shows the officer's note.
    const trimmedNote = note ? String(note).trim() : ''
    const update: Record<string, unknown> = {
      status: action === 'clear' ? 'cleared' : 'flagged',
      flag_note: trimmedNote || null,
      flag_type: action === 'flag' ? flag_type : null,
      screened_by: perm.user.id,
      screened_at: new Date().toISOString(),
      finance_review_status: action === 'flag' ? 'pending' : null,
      finance_review_note: null,
      finance_reviewed_by: null,
      finance_reviewed_at: null,
      alerted_at: null
    }

    const { error: updateError } = await supabase
      .from('compliance_screenings')
      .update(update)
      .eq('id', params.id)
    if (updateError) throw updateError

    // Whitelist cleared names for future auto-approval
    if (action === 'clear') {
      const names: string[] = Array.isArray(screening.names) ? screening.names : []
      const rows = names
        .map(name => ({ name, normalized_key: normalizedNameKey(name) }))
        .filter(r => r.normalized_key.length > 0)
        .map(r => ({
          ...r,
          source: 'screening_clearance',
          created_by: perm.user.id
        }))
      if (rows.length > 0) {
        const { error: whitelistError } = await supabase
          .from('approved_beneficiaries')
          .upsert(rows, { onConflict: 'normalized_key', ignoreDuplicates: true })
        if (whitelistError) {
          console.error('Error whitelisting cleared names:', whitelistError)
        }
      }
    }

    let alertDetail: string | undefined
    if (action === 'flag' && flag_type === 'sanctions_match') {
      const project = screening.err_projects as
        | { err_id?: string | null }
        | { err_id?: string | null }[]
        | null
      const errId = Array.isArray(project) ? project[0]?.err_id : project?.err_id
      const alert = await sendSanctionsMatchAlert({
        errId: errId || null,
        projectId: screening.project_id,
        names: Array.isArray(screening.names) ? screening.names : [],
        note: String(note).trim(),
        screeningId: screening.id
      })
      alertDetail = alert.detail
      await supabase
        .from('compliance_screenings')
        .update({ alerted_at: new Date().toISOString() })
        .eq('id', params.id)
    }

    return NextResponse.json({
      success: true,
      status: update.status,
      flag_type: update.flag_type,
      alert: alertDetail
    })
  } catch (error) {
    console.error('Error recording screening decision:', error)
    return NextResponse.json({ error: 'Failed to record decision' }, { status: 500 })
  }
}
