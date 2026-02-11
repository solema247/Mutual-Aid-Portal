import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import type { UserOverridesMap } from '@/lib/permissions'

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

function writeOverrides(data: UserOverridesMap) {
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function PUT(
  request: Request,
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
      .select('id')
      .eq('id', userId)
      .single()
    if (targetError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    const add = Array.isArray(body.add) ? body.add : []
    const remove = Array.isArray(body.remove) ? body.remove : []

    const overrides = readOverrides()
    if (add.length === 0 && remove.length === 0) {
      delete overrides[userId]
    } else {
      overrides[userId] = { add, remove }
    }
    writeOverrides(overrides)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error in PUT /api/permissions/user/[userId]/overrides:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
