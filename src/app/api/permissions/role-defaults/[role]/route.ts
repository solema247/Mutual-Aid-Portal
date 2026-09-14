import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getFunctionList } from '@/lib/permissions'
import {
  isEditableRoleDefault,
  saveRoleDefaults,
} from '@/lib/roleDefaultsDb'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ role: string }> }
) {
  const { role } = await params
  if (!isEditableRoleDefault(role)) {
    return NextResponse.json(
      { error: 'This role’s default pack cannot be edited' },
      { status: 400 }
    )
  }

  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: currentUser } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single()

  if (
    currentUser?.role !== 'admin' &&
    currentUser?.role !== 'superadmin' &&
    currentUser?.role !== 'support'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { function_codes?: string[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validCodes = new Set(getFunctionList().map((f) => f.code))
  const functionCodes = Array.isArray(body.function_codes)
    ? [...new Set(body.function_codes.filter((c) => typeof c === 'string' && validCodes.has(c)))]
    : null

  if (!functionCodes) {
    return NextResponse.json({ error: 'function_codes must be an array' }, { status: 400 })
  }

  const { error } = await saveRoleDefaults(supabase, role, functionCodes, currentUser.id)
  if (error) {
    console.error('Save role defaults error:', error)
    return NextResponse.json(
      {
        error:
          'Failed to save role defaults. Ensure the role_permission_defaults table exists (see sql/create_role_permission_defaults.sql).',
        detail: error.message,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, role, function_codes: functionCodes })
}
