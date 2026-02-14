import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { can, type PermissionUser } from '@/lib/permissions'

export interface AuthUser {
  id: string
  role: string
}

/**
 * Get current user from session and require permission for the given function.
 * Use at the start of API routes that perform sensitive actions.
 * @returns { user } if allowed, or a NextResponse (401/404/403) to return
 */
export async function requirePermission(
  functionCode: string
): Promise<{ user: AuthUser } | NextResponse> {
  const supabase = getSupabaseRouteClient()
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single()

  if (userError || !userRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const permUser: PermissionUser = {
    id: userRow.id,
    role: userRow.role as PermissionUser['role'],
  }

  if (!can(permUser, functionCode)) {
    return NextResponse.json(
      { error: 'Forbidden - You do not have permission for this action', code: 'PERMISSION_DENIED', functionCode },
      { status: 403 }
    )
  }

  return { user: { id: userRow.id, role: userRow.role } }
}
