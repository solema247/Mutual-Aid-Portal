import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export type AuditLogViewer = {
  id: string
  role: string
}

/**
 * Authorize Audit Log read access for active support / admin / superadmin.
 * Mirrors SQL `is_audit_log_viewer()` without introducing a new function-code permission.
 */
export async function requireAuditLogViewer(): Promise<
  { user: AuditLogViewer } | NextResponse
> {
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, role, status')
    .eq('auth_user_id', session.user.id)
    .single()

  if (userError || !userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (userRow.status !== 'active') {
    return NextResponse.json({ error: 'Account is not active' }, { status: 403 })
  }

  if (
    userRow.role !== 'admin' &&
    userRow.role !== 'superadmin' &&
    userRow.role !== 'support'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { user: { id: userRow.id as string, role: userRow.role as string } }
}
