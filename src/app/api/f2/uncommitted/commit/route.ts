import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { getComplianceBlockedProjectIds } from '@/lib/compliance'

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

    const { error } = await supabase
      .from('err_projects')
      .update({ funding_status: 'committed', status: 'approved' })
      .in('id', f1_ids)

    if (error) throw error

    return NextResponse.json({ success: true, committed_count: f1_ids.length })
  } catch (error) {
    console.error('Error committing F1s:', error)
    return NextResponse.json({ error: 'Failed to commit F1s' }, { status: 500 })
  }
}


