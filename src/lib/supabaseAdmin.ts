import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pairClients } from '@/lib/sbPair'
import {
  getActiveService,
  getRemoteBService,
  hasPairedWrite,
  hasRemoteA,
} from '@/lib/sbEnv'

function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export function getSupabaseAdmin(): SupabaseClient {
  const primary = getActiveService()
  const primaryClient = createServiceClient(primary.url, primary.serviceRoleKey)

  if (!hasPairedWrite()) {
    return primaryClient
  }

  const secondary = getRemoteBService()
  const secondaryClient = createServiceClient(secondary.url, secondary.serviceRoleKey)
  return pairClients(primaryClient, secondaryClient)
}

export function getRemoteBAdmin(): SupabaseClient {
  const remote = getRemoteBService()
  return createServiceClient(remote.url, remote.serviceRoleKey)
}

export function getRemoteAAdmin(): SupabaseClient {
  if (!hasRemoteA()) {
    return getSupabaseAdmin()
  }
  const remote = getActiveService()
  return createServiceClient(remote.url, remote.serviceRoleKey)
}
