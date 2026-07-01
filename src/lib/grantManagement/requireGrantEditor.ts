import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

const GRANT_EDITOR_ROLES = new Set(['support', 'admin', 'superadmin'])

type GrantEditorContext = {
  supabase: SupabaseClient
  user: { id: string; role: string }
}

type GrantEditorResult =
  | { ok: true; ctx: GrantEditorContext }
  | { ok: false; response: NextResponse }

/** Require an authenticated support/admin/superadmin for grant-management mutations. */
export async function requireGrantEditor(): Promise<GrantEditorResult> {
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single()

  if (userError || !userData) {
    return { ok: false, response: NextResponse.json({ error: 'User not found' }, { status: 404 }) }
  }

  if (!GRANT_EDITOR_ROLES.has(userData.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, ctx: { supabase, user: userData } }
}
