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

function maybePair(primary: SupabaseClient): SupabaseClient {
  if (!hasPairedWrite()) return primary
  const secondary = getRemoteBService()
  const secondaryClient = createClient(secondary.url, secondary.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return pairClients(primary, secondaryClient)
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
