import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSbRouteClient } from '@/lib/sbRoute'
import { resolveEnvironmentForUser } from '@/lib/canvas/resolveEnvironment'
import type { ResolvedCanvasContext } from '@/lib/canvas/types'
import { CANVAS_ADMIN_ROLES, roleBypassesMountGating } from '@/lib/canvas/types'

export type CanvasSession = {
  supabase: SupabaseClient
  user: { id: string; role: string }
  canvas: ResolvedCanvasContext
}

export async function requireCanvasSession(): Promise<CanvasSession | NextResponse> {
  const supabase = createSbRouteClient()
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const canvas = await resolveEnvironmentForUser(supabase, userRow.id, {
    bypassMountGating: roleBypassesMountGating(userRow.role),
  })
  return {
    supabase,
    user: { id: userRow.id, role: userRow.role ?? '' },
    canvas,
  }
}

export function isCanvasAdmin(role: string): boolean {
  return CANVAS_ADMIN_ROLES.has(role)
}
