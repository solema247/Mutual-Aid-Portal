import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { status } = await request.json()
    const projectId = params.id

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    // Only allow completing projects (not historical projects)
    // Historical projects have IDs starting with 'historical_'
    if (projectId.startsWith('historical_')) {
      return NextResponse.json({ 
        error: 'Cannot complete historical projects. This action is only available for projects uploaded via the Portal.' 
      }, { status: 400 })
    }

    // Verify the project exists in err_projects
    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, status')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Update the project status
    const { error: updateError } = await supabase
      .from('err_projects')
      .update({ status: status || 'completed' })
      .eq('id', projectId)

    if (updateError) {
      console.error('Error updating project status:', updateError)
      return NextResponse.json({ error: 'Failed to update project status' }, { status: 500 })
    }

    return NextResponse.json({ success: true, status: status || 'completed' })
  } catch (error) {
    console.error('Error in PATCH /api/projects/[id]/status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

