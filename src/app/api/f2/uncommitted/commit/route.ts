import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { getComplianceBlockedProjectIds } from '@/lib/compliance'
import { markProjectsCommitted } from '@/lib/f2Commit'
import { assertProjectsInGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'

// POST /api/f2/uncommitted/commit - Commit selected F1s (set funding_status to committed and status to approved)
export async function POST(request: Request) {
  try {
    const perm = await requirePermission('f2_commit')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const { f1_ids } = await request.json()

    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
    }

    const scope = await assertProjectsInGrantAccess(f1_ids.map(String))
    if (!scope.ok) return scope.response

    // Compliance gate: F1s flagged by screening cannot be committed
    // until the finance team approves them
    const blocked = await getComplianceBlockedProjectIds(supabase, f1_ids)
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: 'Some F1s are flagged by compliance screening and pending finance review. They cannot be committed.',
          code: 'COMPLIANCE_BLOCKED',
          blocked_ids: blocked
        },
        { status: 400 }
      )
    }

    const { data: beforeRows } = await supabase
      .from('err_projects')
      .select('id, status, funding_status')
      .in('id', f1_ids)

    const { error } = await markProjectsCommitted(supabase, f1_ids, {
      status: 'approved',
      committedBy: perm.user.email?.trim() || null,
    })
    if (error) throw error

    const beforeById = new Map(
      (beforeRows || []).map((row) => [String(row.id), row])
    )
    for (const f1Id of f1_ids) {
      const before = beforeById.get(String(f1Id))
      await emitF123Audit({
        action: 'f2.committed',
        actorUserId: perm.user.id,
        endpoint: 'POST /api/f2/uncommitted/commit',
        request,
        targetType: 'project',
        targetId: String(f1Id),
        oldValues: {
          status: before?.status ?? null,
          funding_status: before?.funding_status ?? null
        },
        newValues: {
          status: 'approved',
          funding_status: 'committed'
        },
        metadata: {
          committed_count: f1_ids.length
        }
      })
    }

    return NextResponse.json({ success: true, committed_count: f1_ids.length })
  } catch (error) {
    console.error('Error committing F1s:', error)
    return NextResponse.json({ error: 'Failed to commit F1s' }, { status: 500 })
  }
}
