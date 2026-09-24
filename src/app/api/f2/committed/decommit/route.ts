import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { assertProjectInGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'

// POST /api/f2/committed/decommit - Move a committed project back to uncommitted (only if not in an MOU)
export async function POST(request: Request) {
  try {
    const perm = await requirePermission('f2_commit')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }

    const scope = await assertProjectInGrantAccess(String(id))
    if (!scope.ok) return scope.response

    const { data: project, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, funding_status, mou_id, status')
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

    await emitF123Audit({
      action: 'f2.decommitted',
      actorUserId: perm.user.id,
      endpoint: 'POST /api/f2/committed/decommit',
      request,
      targetType: 'project',
      targetId: String(id),
      oldValues: {
        status: project.status ?? null,
        funding_status: project.funding_status ?? null
      },
      newValues: {
        status: 'pending',
        funding_status: 'unassigned'
      }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error de-committing project:', error)
    return NextResponse.json(
      { error: 'Failed to de-commit project' },
      { status: 500 }
    )
  }
}
