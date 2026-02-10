import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * POST /api/f3/mous/[id]/projects/add
 * Add projects to an existing MOU. Only allowed when MOU is not yet assigned to a grant.
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

    // Ensure MOU is not assigned: no project linked to this MOU has grant_id starting with LCC-
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
        { error: 'Cannot add projects: MOU is already assigned to a grant' },
        { status: 400 }
      )
    }

    // Fetch candidate projects and validate: committed, approved, not linked to any MOU
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select('id, expenses, funding_status, status, mou_id')
      .in('id', project_ids)

    if (projErr) throw projErr
    if (!projects || projects.length !== project_ids.length) {
      return NextResponse.json({ error: 'Some projects not found' }, { status: 400 })
    }

    const invalid = projects.filter(
      (p: any) => p.funding_status !== 'committed' || p.status !== 'approved'
    )
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: 'All projects must be committed and approved' },
        { status: 400 }
      )
    }
    const alreadyLinked = projects.filter((p: any) => !!p.mou_id)
    if (alreadyLinked.length > 0) {
      return NextResponse.json(
        {
          error: 'Some projects are already linked to an MOU',
          project_ids: alreadyLinked.map((p: any) => p.id),
        },
        { status: 400 }
      )
    }

    // Link projects to this MOU
    const { error: linkErr } = await supabase
      .from('err_projects')
      .update({ mou_id: mouId })
      .in('id', project_ids)

    if (linkErr) throw linkErr

    // Recompute total_amount for the MOU from all linked projects
    const { data: allProjects, error: sumErr } = await supabase
      .from('err_projects')
      .select('expenses')
      .eq('mou_id', mouId)
    if (sumErr) throw sumErr

    const sumExpenses = (exp: any): number => {
      const arr =
        typeof exp === 'string' ? JSON.parse(exp || '[]') : Array.isArray(exp) ? exp : []
      return arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0)
    }
    const total_amount = (allProjects || []).reduce(
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
      added_count: project_ids.length,
      total_amount,
    })
  } catch (error) {
    console.error('Error adding projects to MOU:', error)
    return NextResponse.json(
      { error: 'Failed to add projects to MOU' },
      { status: 500 }
    )
  }
}
