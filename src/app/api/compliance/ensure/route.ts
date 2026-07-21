import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { ensureScreeningsForProjects } from '@/lib/compliance'

// POST /api/compliance/ensure - Create compliance screenings for specific projects
// Called after client-side F1 inserts so new F1s land in the screening queue immediately.
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { project_ids } = await request.json()
    if (!project_ids || !Array.isArray(project_ids) || project_ids.length === 0) {
      return NextResponse.json({ error: 'project_ids array is required' }, { status: 400 })
    }

    const { data: projects, error } = await supabase
      .from('err_projects')
      .select('id, banking_details')
      .in('id', project_ids)
    if (error) throw error

    const result = await ensureScreeningsForProjects(supabase, projects || [])
    return NextResponse.json({ success: true, created: result.created })
  } catch (error) {
    console.error('Error ensuring compliance screenings:', error)
    return NextResponse.json({ error: 'Failed to ensure screenings' }, { status: 500 })
  }
}
