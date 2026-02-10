import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * POST /api/f3/mous/[id]/projects/remove
 * Remove projects from an existing MOU. Only allowed when MOU is not yet assigned to a grant.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const mouId = params.id
    const body = await request.json()
    const { project_ids } = body || {}

    if (!Array.isArray(project_ids) || project_ids.length === 0) {
      return NextResponse.json({ error: 'project_ids is required (non-empty array)' }, { status: 400 })
    }

    // Load MOU
    const { data: mou, error: mouErr } = await supabase
      .from('mous')
      .select('id')
      .eq('id', mouId)
      .single()
    if (mouErr || !mou) {
      return NextResponse.json({ error: 'MOU not found' }, { status: 404 })
    }

    // Ensure MOU is not assigned
    const { data: existingProjects, error: existingErr } = await supabase
      .from('err_projects')
      .select('id, grant_id')
      .eq('mou_id', mouId)
    if (existingErr) throw existingErr
    const hasAssigned = (existingProjects || []).some(
      (p: any) => p.grant_id && String(p.grant_id).startsWith('LCC-')
    )
    if (hasAssigned) {
      return NextResponse.json(
        { error: 'Cannot remove projects: MOU is already assigned to a grant' },
        { status: 400 }
      )
    }

    // Unlink only projects that currently belong to this MOU
    const { error: unlinkErr } = await supabase
      .from('err_projects')
      .update({ mou_id: null })
      .eq('mou_id', mouId)
      .in('id', project_ids)

    if (unlinkErr) throw unlinkErr

    // Recompute total_amount from remaining linked projects
    const { data: remainingProjects, error: sumErr } = await supabase
      .from('err_projects')
      .select('expenses')
      .eq('mou_id', mouId)
    if (sumErr) throw sumErr

    const sumExpenses = (exp: any): number => {
      const arr =
        typeof exp === 'string' ? JSON.parse(exp || '[]') : Array.isArray(exp) ? exp : []
      return arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0)
    }
    const total_amount = (remainingProjects || []).reduce(
      (s: number, p: any) => s + sumExpenses(p.expenses),
      0
    )

    const { error: updateMouErr } = await supabase
      .from('mous')
      .update({ total_amount })
      .eq('id', mouId)

    if (updateMouErr) throw updateMouErr

    return NextResponse.json({
      success: true,
      removed_count: project_ids.length,
      total_amount,
    })
  } catch (error) {
    console.error('Error removing projects from MOU:', error)
    return NextResponse.json(
      { error: 'Failed to remove projects from MOU' },
      { status: 500 }
    )
  }
}
