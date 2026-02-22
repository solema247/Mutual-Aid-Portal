import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { saveOverrides } from '@/lib/userOverridesDb'

export async function PUT(
  request: Request,
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
  if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { add?: string[]; remove?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const add = Array.isArray(body.add) ? body.add : []
  const remove = Array.isArray(body.remove) ? body.remove : []

  const { error } = await saveOverrides(supabase, userId, add, remove)
  if (error) {
    console.error('Save overrides error:', error)
    return NextResponse.json({ error: 'Failed to save overrides' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
