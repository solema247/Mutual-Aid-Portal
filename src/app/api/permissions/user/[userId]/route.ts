import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  getRoleBase,
  getAllowedSetFromOverrides,
  type PermissionUser
} from '@/lib/permissions'
import { getOverridesForUser } from '@/lib/userOverridesDb'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: currentUser } = await supabase
    .from('users')
    .select('role')
    .eq('auth_user_id', session.user.id)
    .single()
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin' && currentUser?.role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: targetUser, error: userError } = await supabase
    .from('users')
    .select('id, display_name, role')
    .eq('id', userId)
    .single()
  if (userError || !targetUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const override = await getOverridesForUser(supabase, userId)
  const overridesMap = { [userId]: override }
  const permUser: PermissionUser = {
    id: targetUser.id,
    role: targetUser.role as PermissionUser['role']
  }
  const allowedSet = getAllowedSetFromOverrides(permUser, overridesMap)
  const roleBase = getRoleBase(targetUser.role)

  return NextResponse.json({
    user: {
      id: targetUser.id,
      display_name: targetUser.display_name,
      role: targetUser.role
    },
    allowed: Array.from(allowedSet),
    roleBase,
    overrides: { add: override.add, remove: override.remove }
  })
}
