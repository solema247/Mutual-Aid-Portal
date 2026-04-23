import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { can, type Role } from '@/lib/permissions'
import { getOverridesForUser } from '@/lib/userOverridesDb'

export type RouteAuthContext = {
  supabase: SupabaseClient
  dbUser: { id: string; role: string }
  overridesMap: Record<string, { add: string[]; remove: string[] }>
}

export async function getRouteHandlerAuth (): Promise<RouteAuthContext | null> {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: dbUser, error } = await supabase
    .from('users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single()

  if (error || !dbUser) return null

  const override = await getOverridesForUser(supabase, dbUser.id)
  return {
    supabase,
    dbUser,
    overridesMap: { [dbUser.id]: override }
  }
}

export function assertPermission (ctx: RouteAuthContext, functionCode: string): void {
  const ok = can(
    { id: ctx.dbUser.id, role: ctx.dbUser.role as Role },
    functionCode,
    ctx.overridesMap
  )
  if (!ok) {
    const err = new Error('Forbidden')
    ;(err as Error & { statusCode?: number }).statusCode = 403
    throw err
  }
}

/** ERR App submissions list excludes mutual_aid_portal-only pool rows. */
export function isErrSubmissionSource (source: string | null): boolean {
  return source == null || source !== 'mutual_aid_portal'
}
