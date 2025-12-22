import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// POST /api/f2/uncommitted/commit - Commit selected F1s (set funding_status to committed and status to approved)
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { f1_ids } = await request.json()

    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
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


