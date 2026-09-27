import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { ensureScreeningsForProjects } from '@/lib/compliance'
import { forbidIfPartner } from '@/lib/routeHandlerAuth'
import { applyEmergencyRoomIdFilter, getUserRoomAccess } from '@/lib/userRoomAccess'

// POST /api/compliance/ensure - Create compliance screenings for specific projects
// Called after client-side F1 inserts so new F1s land in the screening queue immediately.
export async function POST(request: Request) {
  try {
    const partnerBlock = await forbidIfPartner()
    if (partnerBlock) return partnerBlock

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

    // Base ERR may only trigger screenings for projects in its own emergency room
    const roomAccess = await getUserRoomAccess()
    if (roomAccess.mode === 'none') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let projectQuery = supabase
      .from('err_projects')
      .select('id, banking_details')
      .in('id', project_ids)
    projectQuery = applyEmergencyRoomIdFilter(projectQuery, roomAccess)
    const { data: projects, error } = await projectQuery
    if (error) throw error

    const result = await ensureScreeningsForProjects(supabase, projects || [])
    return NextResponse.json({ success: true, created: result.created })
  } catch (error) {
    console.error('Error ensuring compliance screenings:', error)
    return NextResponse.json({ error: 'Failed to ensure screenings' }, { status: 500 })
  }
}
