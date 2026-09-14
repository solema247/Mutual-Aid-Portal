import { NextResponse } from 'next/server'
import { isReportingStatusCompleted } from '@/lib/projectStatus'
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
      .select('id, status, f4_status, f5_status')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const newStatus = status || 'completed'
    if (newStatus === 'completed') {
      const f4Done = isReportingStatusCompleted(project.f4_status)
      const f5Done = isReportingStatusCompleted(project.f5_status)
      if (!f4Done || !f5Done) {
        const missing = [
          !f4Done ? 'F4' : null,
          !f5Done ? 'F5' : null,
        ].filter(Boolean).join(' and ')
        return NextResponse.json(
          {
            error: `Both F4 and F5 must be marked completed before completing the project. Still missing: ${missing}.`,
            code: 'reporting_incomplete',
            f4_status: project.f4_status,
            f5_status: project.f5_status,
          },
          { status: 400 }
        )
      }
    }

    // Update the project status, tracking when it was marked completed
    const { error: updateError } = await supabase
      .from('err_projects')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
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
