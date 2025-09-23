import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// POST /api/f2/uncommitted/commit - Commit selected F1s (set funding_status to committed and status to approved)
export async function POST(request: Request) {
  try {
    const { f1_ids } = await request.json()

    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
    }

    // Validate that each project has an approval file uploaded
    const { data: approvalsCheck, error: chkErr } = await supabase
      .from('err_projects')
      .select('id, approval_file_key')
      .in('id', f1_ids)

    if (chkErr) throw chkErr

    const missing = (approvalsCheck || []).filter((p: any) => !p.approval_file_key).map((p: any) => p.id)
    if (missing.length > 0) {
      return NextResponse.json({ error: 'Missing F2 approval document', missing_project_ids: missing }, { status: 400 })
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


