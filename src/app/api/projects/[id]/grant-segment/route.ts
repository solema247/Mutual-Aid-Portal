import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * PATCH /api/projects/[id]/grant-segment
 * Body: { grant_segment: string | null }
 * Updates err_projects.grant_segment for portal projects only.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: projectId } = await params
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }
    if (projectId.startsWith('historical_')) {
      return NextResponse.json(
        { error: 'Cannot update grant segment for historical projects.' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const raw = body.grant_segment
    const grantSegment =
      raw === undefined || raw === null || String(raw).trim() === ''
        ? null
        : String(raw).trim()

    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (grantSegment) {
      const { data: segment, error: segErr } = await supabase
        .from('grant_segments')
        .select('code')
        .eq('code', grantSegment)
        .maybeSingle()
      if (segErr) {
        console.error('Error validating grant segment:', segErr)
        return NextResponse.json({ error: 'Failed to validate grant segment' }, { status: 500 })
      }
      if (!segment) {
        return NextResponse.json({ error: 'Invalid grant segment' }, { status: 400 })
      }
    }

    const { error: updateError } = await supabase
      .from('err_projects')
      .update({ grant_segment: grantSegment })
      .eq('id', projectId)

    if (updateError) {
      console.error('Error updating grant segment:', updateError)
      const msg = updateError.message?.includes('grant_segment')
        ? 'Invalid grant segment'
        : 'Failed to update grant segment'
      const status =
        updateError.code === '23503' || updateError.code === '23514' ? 400 : 500
      return NextResponse.json({ error: msg }, { status })
    }

    return NextResponse.json({ success: true, grant_segment: grantSegment })
  } catch (e) {
    console.error('PATCH /api/projects/[id]/grant-segment:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
