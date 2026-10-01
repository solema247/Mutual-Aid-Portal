import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  applyMouInScopeProjectFilter,
  assertMouInGrantAccess,
  assertProjectsInGrantAccess,
  isProjectIdInMouScope,
} from '@/lib/userGrantAccess'

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

    const mouScope = await assertMouInGrantAccess(mouId)
    if (!mouScope.ok) return mouScope.response

    const projectScope = await assertProjectsInGrantAccess(project_ids.map(String), mouScope.access)
    if (!projectScope.ok) return projectScope.response

    for (const pid of project_ids.map(String)) {
      if (!isProjectIdInMouScope(mouScope.inScopeProjectIds, pid)) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
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

    // Ensure MOU is not assigned (in-scope projects only for Base ERR / Partner)
    let existingQuery = supabase
      .from('err_projects')
      .select('id, grant_id')
      .eq('mou_id', mouId)
    existingQuery = applyMouInScopeProjectFilter(
      existingQuery,
      mouScope.inScopeProjectIds
    )
    const { data: existingProjects, error: existingErr } = await existingQuery
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

    // Unlink only requested projects that belong to this MOU and are in scope
    const idsToUnlink = project_ids
      .map(String)
      .filter((pid) => isProjectIdInMouScope(mouScope.inScopeProjectIds, pid))
    if (idsToUnlink.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { error: unlinkErr } = await supabase
      .from('err_projects')
      .update({ mou_id: null })
      .eq('mou_id', mouId)
      .in('id', idsToUnlink)

    if (unlinkErr) throw unlinkErr

    // Recompute total_amount from remaining linked projects (all rooms —
    // MOU total is a shared document field; Base ERR cannot see other rooms' rows in UI)
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
      removed_count: idsToUnlink.length,
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
