import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getFunctionsByModule } from '@/lib/permissions'

export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('auth_user_id', session.user.id)
      .single()
    if (userError || !currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const byModule = getFunctionsByModule()
    return NextResponse.json(byModule)
  } catch (error) {
    console.error('Error fetching permission functions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
