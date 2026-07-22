import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { sweepUnscreenedProjects } from '@/lib/compliance'

// GET /api/compliance/queue - List compliance screenings joined with F1 details.
// Runs an idempotent sweep first so F1s created outside portal API routes
// (ERR App submissions, legacy inserts) and pre-existing F1s are backfilled.
// Query params:
//   status: filter by screening status (pending_screening | cleared | flagged | auto_approved)
//   count_only: '1' to return only the pending count (for the sidebar badge)
export async function GET(request: Request) {
  try {
    const perm = await requirePermission('compliance_view_page')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const countOnly = searchParams.get('count_only') === '1'

    if (countOnly) {
      // Lightweight path for the sidebar badge: count pending screenings that
      // actually have an F1 file attached (matches the hidden-no-F1 filter below)
      const { data, error } = await supabase
        .from('compliance_screenings')
        .select('id, err_projects!inner(file_key, temp_file_key)')
        .eq('status', 'pending_screening')
      if (error) throw error
      const count = (data || []).filter((r) => {
        const raw = (r as { err_projects?: unknown }).err_projects
        const p = (Array.isArray(raw) ? raw[0] : raw) as
          | { file_key?: string | null; temp_file_key?: string | null }
          | undefined
        return !!(p && (p.file_key || p.temp_file_key))
      }).length
      return NextResponse.json({ pending_count: count })
    }

    try {
      await sweepUnscreenedProjects(supabase)
    } catch (sweepError) {
      // Sweep failure shouldn't block viewing the existing queue
      console.error('Compliance sweep error:', sweepError)
    }

    let query = supabase
      .from('compliance_screenings')
      .select(`
        id,
        project_id,
        names,
        status,
        flag_type,
        flag_note,
        alerted_at,
        screened_at,
        finance_review_status,
        finance_review_note,
        finance_reviewed_at,
        created_at,
        err_projects (
          id,
          err_id,
          date,
          state,
          locality,
          status,
          funding_status,
          banking_details,
          intended_beneficiaries,
          project_objectives,
          expenses,
          file_key,
          temp_file_key,
          identity_document_file_key,
          emergency_rooms (err_code, name_ar, name)
        )
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error

    type RoomJoin = { err_code?: string | null; name_ar?: string | null; name?: string | null }
    type ProjectJoin = {
      id?: string
      err_id?: string | null
      date?: string | null
      state?: string | null
      locality?: string | null
      status?: string | null
      funding_status?: string | null
      banking_details?: string | null
      intended_beneficiaries?: string | null
      project_objectives?: string | null
      expenses?: unknown
      file_key?: string | null
      temp_file_key?: string | null
      identity_document_file_key?: string | null
      emergency_rooms?: RoomJoin | RoomJoin[] | null
    }

    const formatted = (data || []).map((row) => {
      const rawProject = row.err_projects as unknown
      const p: ProjectJoin = (Array.isArray(rawProject) ? rawProject[0] : rawProject) || {}
      const rawRoom = p.emergency_rooms as unknown
      const room: RoomJoin = (Array.isArray(rawRoom) ? rawRoom[0] : rawRoom) || {}
      let expenses: Array<{ activity: string; total_cost: number }> = []
      try {
        expenses = typeof p.expenses === 'string'
          ? JSON.parse(p.expenses)
          : (p.expenses as Array<{ activity: string; total_cost: number }>) || []
      } catch {
        expenses = []
      }
      return {
        id: row.id,
        project_id: row.project_id,
        names: row.names || [],
        status: row.status,
        flag_type: row.flag_type || null,
        flag_note: row.flag_note,
        alerted_at: row.alerted_at || null,
        screened_at: row.screened_at,
        finance_review_status: row.finance_review_status,
        finance_review_note: row.finance_review_note,
        finance_reviewed_at: row.finance_reviewed_at,
        created_at: row.created_at,
        err_id: p.err_id || null,
        err_name: room.name_ar || room.name || null,
        date: p.date || null,
        state: p.state || null,
        locality: p.locality || null,
        project_status: p.status || null,
        funding_status: p.funding_status || null,
        banking_details: p.banking_details || null,
        intended_beneficiaries: p.intended_beneficiaries || null,
        project_objectives: p.project_objectives || null,
        total_amount: expenses.reduce((sum, e) => sum + (e.total_cost || 0), 0),
        f1_file_key: p.file_key || null,
        temp_file_key: p.temp_file_key || null,
        identity_document_file_key: p.identity_document_file_key || null
      }
    })

    // Only surface screenings that actually have an F1 document attached
    // (Ahmed's request: hide records with no F1 file). The real F1 lives in
    // err_projects.file_key; some legacy/in-progress uploads use temp_file_key.
    const withF1 = formatted.filter(r => r.f1_file_key || r.temp_file_key)

    return NextResponse.json(withF1)
  } catch (error) {
    console.error('Error fetching compliance queue:', error)
    return NextResponse.json({ error: 'Failed to fetch compliance queue' }, { status: 500 })
  }
}
