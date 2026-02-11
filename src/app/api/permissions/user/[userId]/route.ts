import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getAllowedSetFromOverrides, getRoleBase, type PermissionUser, type UserOverridesMap } from '@/lib/permissions'

const OVERRIDES_PATH = path.join(process.cwd(), 'src', 'data', 'userOverrides.json')

function readOverrides(): UserOverridesMap {
  try {
    const raw = fs.readFileSync(OVERRIDES_PATH, 'utf-8')
    return JSON.parse(raw) as UserOverridesMap
  } catch (e) {
    console.error('Error reading userOverrides.json:', e)
    return {}
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const userId = params.userId
    const supabase = getSupabaseRouteClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: currentUser, error: currentError } = await supabase
      .from('users')
      .select('role')
      .eq('auth_user_id', session.user.id)
      .single()
    if (currentError || !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('id, display_name, role')
      .eq('id', userId)
      .single()
    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const overrides = readOverrides()
    const permUser: PermissionUser = { id: targetUser.id, role: targetUser.role as PermissionUser['role'] }
    const allowedSet = getAllowedSetFromOverrides(permUser, overrides)
    const allowed = Array.from(allowedSet)
    const override = overrides[userId] || { add: [], remove: [] }
    const roleBase = getRoleBase(targetUser.role)

    return NextResponse.json({
      user: {
        id: targetUser.id,
        display_name: targetUser.display_name,
        role: targetUser.role,
      },
      allowed,
      roleBase,
      overrides: {
        add: override.add || [],
        remove: override.remove || [],
      },
    })
  } catch (error) {
    console.error('Error in GET /api/permissions/user/[userId]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
