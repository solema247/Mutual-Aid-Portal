import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// POST /api/f2/committed/decommit - Move a committed project back to uncommitted (only if not in an MOU)
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, funding_status, mou_id')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.funding_status !== 'committed') {
      return NextResponse.json(
        { error: 'Project is not committed' },
        { status: 400 }
      )
    }

    if (project.mou_id) {
      return NextResponse.json(
        { error: 'Cannot de-commit: project is assigned to an MOU' },
        { status: 400 }
      )
    }

    const { error: updateError } = await supabase
      .from('err_projects')
      .update({ status: 'pending', funding_status: 'unassigned' })
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error de-committing project:', error)
    return NextResponse.json(
      { error: 'Failed to de-commit project' },
      { status: 500 }
    )
  }
}
