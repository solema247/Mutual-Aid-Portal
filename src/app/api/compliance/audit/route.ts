import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

/**
 * GET /api/compliance/audit
 * Recent compliance audit events (who cleared / flagged / dismissed / approved).
 * Query params:
 *   limit  — max rows (default 100, max 500)
 *   screening_id — optional filter
 *   project_id — optional filter
 *   action — optional filter (e.g. flag_sanctions_match, clear, finance_dismiss)
 */
export async function GET(request: Request) {
  try {
    const perm = await requirePermission('compliance_view_page')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const screeningId = searchParams.get('screening_id')
    const projectId = searchParams.get('project_id')
    const action = searchParams.get('action')
    const limitRaw = parseInt(searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100

    let query = supabase
      .from('compliance_screening_events')
      .select(`
        id,
        screening_id,
        project_id,
        action,
        actor_id,
        note,
        metadata,
        created_at,
        users:actor_id ( display_name ),
        err_projects:project_id ( err_id )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (screeningId) query = query.eq('screening_id', screeningId)
    if (projectId) query = query.eq('project_id', projectId)
    if (action) query = query.eq('action', action)

    const { data, error } = await query
    if (error) throw error

    const formatted = (data || []).map((row) => {
      const userRaw = row.users as unknown
      const user = (Array.isArray(userRaw) ? userRaw[0] : userRaw) as
        | { display_name?: string | null }
        | null
      const projectRaw = row.err_projects as unknown
      const project = (Array.isArray(projectRaw) ? projectRaw[0] : projectRaw) as
        | { err_id?: string | null }
        | null
      return {
        id: row.id,
        screening_id: row.screening_id,
        project_id: row.project_id,
        action: row.action,
        actor_id: row.actor_id,
        actor_name: user?.display_name || null,
        note: row.note,
        metadata: row.metadata || {},
        created_at: row.created_at,
        err_id: project?.err_id || null
      }
    })

    return NextResponse.json(formatted)
  } catch (error) {
    console.error('Error fetching compliance audit log:', error)
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}
