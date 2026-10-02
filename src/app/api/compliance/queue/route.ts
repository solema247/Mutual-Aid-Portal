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
      // Sidebar badge: items that still need Ahmed's attention —
      // pending screening OR missing-ID with ID uploaded awaiting his Clear.
      // Committed F1s stay in the workflow until Cleared (retrospective review).
      const { data, error } = await supabase
        .from('compliance_screenings')
        .select(
          'id, status, flag_type, finance_review_status, err_projects!inner(file_key, temp_file_key, funding_status, status)'
        )
        .or(
          'status.eq.pending_screening,and(status.eq.flagged,flag_type.eq.missing_id,finance_review_status.eq.id_uploaded)'
        )
      if (error) throw error
      const count = (data || []).filter((r) => {
        const raw = (r as { err_projects?: unknown }).err_projects
        const p = (Array.isArray(raw) ? raw[0] : raw) as
          | {
              file_key?: string | null
              temp_file_key?: string | null
              funding_status?: string | null
              status?: string | null
            }
          | undefined
        if (!p) return false
        if (!(p.file_key || p.temp_file_key)) return false
        if (p.status === 'completed' || p.status === 'declined') return false
        return true
      }).length
      return NextResponse.json({ pending_count: count })
    }

    try {
      await sweepUnscreenedProjects(supabase)
    } catch (sweepError) {
      // Sweep failure shouldn't block viewing the existing queue
      console.error('Compliance sweep error:', sweepError)
    }

    const selectWithCommitted = `
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
          submitted_at,
          last_modified,
          committed_at,
          committed_by,
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
      `

    const selectLegacy = `
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
          submitted_at,
          last_modified,
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
      `

    let query = supabase
      .from('compliance_screenings')
      .select(selectWithCommitted)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    let data: unknown[] | null = null
    let error: { message?: string } | null = null
    {
      const first = await query
      data = first.data as unknown[] | null
      error = first.error
    }
    if (error && /committed_at|committed_by/i.test(error.message || '')) {
      let legacy = supabase
        .from('compliance_screenings')
        .select(selectLegacy)
        .order('created_at', { ascending: false })
      if (status) legacy = legacy.eq('status', status)
      const retry = await legacy
      data = retry.data as unknown[] | null
      error = retry.error
    }
    if (error) throw error

    type RoomJoin = { err_code?: string | null; name_ar?: string | null; name?: string | null }
    type ProjectJoin = {
      id?: string
      err_id?: string | null
      date?: string | null
      submitted_at?: string | null
      last_modified?: string | null
      committed_at?: string | null
      committed_by?: string | null
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

    const formatted = (data || []).map((rawRow) => {
      const row = rawRow as {
        id: string
        project_id: string
        names: string[] | null
        status: string
        flag_type: string | null
        flag_note: string | null
        alerted_at: string | null
        screened_at: string | null
        finance_review_status: string | null
        finance_review_note: string | null
        finance_reviewed_at: string | null
        created_at: string
        err_projects: unknown
      }
      const rawProject = row.err_projects
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
        submitted_at: p.submitted_at || null,
        last_modified: p.last_modified || null,
        committed_at: p.committed_at || null,
        committed_by: p.committed_by || null,
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

    // Visibility rules (end-to-end lifecycle):
    // 1) Always require an F1 document (file_key, with temp_file_key fallback).
    // 2) Active work stays visible until Cleared — including committed / FSP paid
    //    F1s (retrospective "Payment already committed" review).
    // 3) Declined/completed projects drop out of active work only.
    const visible = formatted.filter((r) => {
      if (!(r.f1_file_key || r.temp_file_key)) return false
      const isActiveWork =
        r.status === 'pending_screening' ||
        (r.status === 'flagged' && r.finance_review_status === 'pending') ||
        (r.status === 'flagged' &&
          r.flag_type === 'missing_id' &&
          r.finance_review_status === 'id_uploaded')
      if (isActiveWork) {
        if (r.project_status === 'completed' || r.project_status === 'declined') return false
      }
      return true
    })

    return NextResponse.json(visible)
  } catch (error) {
    console.error('Error fetching compliance queue:', error)
    return NextResponse.json({ error: 'Failed to fetch compliance queue' }, { status: 500 })
  }
}
