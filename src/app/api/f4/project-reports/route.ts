import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

/**
 * GET /api/f4/project-reports?project_id=...
 * Lightweight list of F4 summaries for one project (portal or historical_*).
 */
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const projectId = new URL(request.url).searchParams.get('project_id')?.trim()
    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const { allowedStateNames } = await getUserStateAccess()
    if (allowedStateNames !== null && allowedStateNames.length === 0) {
      return NextResponse.json([])
    }

    const isHistorical = projectId.startsWith('historical_')
    const historicalImportId = isHistorical ? projectId.replace(/^historical_/, '') : null

    let query = supabase
      .from('err_summary')
      .select('id, project_id, report_date, total_expenses, activities_raw_import_id, created_at')
      .order('created_at', { ascending: false })

    if (isHistorical && historicalImportId) {
      query = query.eq('activities_raw_import_id', historicalImportId)
    } else {
      query = query.eq('project_id', projectId).is('activities_raw_import_id', null)

      if (allowedStateNames !== null) {
        const { data: project, error: projectError } = await supabase
          .from('err_projects')
          .select('id, state')
          .eq('id', projectId)
          .maybeSingle()
        if (projectError) throw projectError
        if (!project) return NextResponse.json([])
        const state = project.state != null ? String(project.state) : ''
        if (!allowedStateNames.includes(state)) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
      }
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(
      (data || []).map((row) => ({
        id: row.id,
        project_id: isHistorical ? projectId : row.project_id,
        report_date: row.report_date ?? null,
        total_expenses: row.total_expenses ?? null,
        activities_raw_import_id: row.activities_raw_import_id ?? null,
      }))
    )
  } catch (e) {
    console.error('GET /api/f4/project-reports:', e)
    return NextResponse.json({ error: 'Failed to fetch F4 project reports' }, { status: 500 })
  }
}
