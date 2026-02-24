import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getFunctionsByModule } from '@/lib/permissions'

export async function GET() {
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession()
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('auth_user_id', session.user.id)
    .single()
  const role = userRow?.role
  if (role !== 'admin' && role !== 'superadmin' && role !== 'support') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const byModule = getFunctionsByModule()
  return NextResponse.json(byModule)
}
