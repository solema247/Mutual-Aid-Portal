import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { saveOverrides } from '@/lib/userOverridesDb'

export async function POST(request: Request) {
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
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { user_ids?: string[]; add?: string[]; remove?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const userIds = Array.isArray(body.user_ids) ? body.user_ids : []
  const add = Array.isArray(body.add) ? body.add : []
  const remove = Array.isArray(body.remove) ? body.remove : []

  if (userIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one user' }, { status: 400 })
  }

  const errors: string[] = []
  for (const userId of userIds) {
    const { error } = await saveOverrides(supabase, userId, add, remove)
    if (error) errors.push(`${userId}: ${error.message}`)
  }
  if (errors.length > 0) {
    return NextResponse.json(
      { error: 'Failed to save for some users', details: errors },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, count: userIds.length })
}
