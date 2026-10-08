import {
  createMiddlewareClient,
  createRouteHandlerClient,
} from '@supabase/auth-helpers-nextjs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { pairClients } from '@/lib/sbPair'
import {
  getActivePublic,
  getRemoteBService,
  hasPairedWrite,
} from '@/lib/sbEnv'
import { CANVAS_MIRROR_SKIP_TABLES } from '@/lib/canvas/types'

/**
 * When prod + staging service keys are set, table writes go to prod first then
 * mirror to staging. Storage is never paired (PDF/files stay on prod only).
 * Canvas control-plane tables stay prod-only until staging is synced.
 */
function maybePair(primary: SupabaseClient): SupabaseClient {
  if (!hasPairedWrite()) return primary
  const secondary = getRemoteBService()
  const secondaryClient = createClient(secondary.url, secondary.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return pairClients(primary, secondaryClient, {
    skipMirrorTables: CANVAS_MIRROR_SKIP_TABLES,
  })
}

export function createSbRouteClient() {
  const { url, anonKey } = getActivePublic()
  const primary = createRouteHandlerClient(
    { cookies },
    { supabaseUrl: url, supabaseKey: anonKey }
  ) as unknown as SupabaseClient
  return maybePair(primary)
}

export function createSbMiddlewareClient(req: NextRequest, res: NextResponse) {
  const { url, anonKey } = getActivePublic()
  return createMiddlewareClient(
    { req, res },
    { supabaseUrl: url, supabaseKey: anonKey }
  )
}
