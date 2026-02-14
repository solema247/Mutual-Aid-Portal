import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { userCanAccessAllStates } from '@/lib/userStateAccess'

// POST /api/f2/uncommitted/commit - Commit selected F1s (set funding_status to committed and status to approved)
export async function POST(request: Request) {
  try {
    const auth = await requirePermission('f2_commit')
    if (auth instanceof NextResponse) return auth

    const supabase = getSupabaseRouteClient()
    const { f1_ids } = await request.json()

    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
    }

    // Ensure user can only commit projects in their allowed states
    const { data: projects, error: fetchErr } = await supabase
      .from('err_projects')
      .select('id, state')
      .in('id', f1_ids)
      .eq('status', 'pending')

    if (fetchErr) throw fetchErr
    if (!projects || projects.length !== f1_ids.length) {
      return NextResponse.json({ error: 'Some projects not found or not pending' }, { status: 400 })
    }

    const canAccess = await userCanAccessAllStates(projects.map((p: any) => p.state))
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to one or more projects in the selected states' }, { status: 403 })
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


