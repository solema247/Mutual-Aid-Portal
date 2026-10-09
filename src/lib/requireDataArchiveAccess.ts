import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { canAccessDataArchive } from '@/lib/dataArchiveAccess'

export async function requireDataArchiveAccess(): Promise<
  { user: { id: string; role: string; email: string | null } } | NextResponse
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

  if (userRow.status && userRow.status !== 'active') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!canAccessDataArchive(userRow.role)) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        code: 'PERMISSION_DENIED',
      },
      { status: 403 }
    )
  }

  return {
    user: {
      id: userRow.id,
      role: userRow.role,
      email: session.user.email ?? null,
    },
  }
}
