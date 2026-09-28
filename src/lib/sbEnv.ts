export type SbPublic = {
  url: string
  anonKey: string
}

export type SbService = {
  url: string
  serviceRoleKey: string
}

function trim(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v || undefined
}

export function hasRemoteA(): boolean {
  const url =
    trim(process.env.NEXT_PUBLIC_PROD_SUPABASE_URL) ||
    trim(process.env.PROD_SUPABASE_URL)
  const anon =
    trim(process.env.NEXT_PUBLIC_PROD_SUPABASE_ANON_KEY) ||
    trim(process.env.PROD_SUPABASE_ANON_KEY)
  return Boolean(url && anon)
}

export function hasPairedWrite(): boolean {
  if (!hasRemoteA()) return false
  if (!trim(process.env.PROD_SUPABASE_SERVICE_ROLE_KEY)) return false
  if (!trim(process.env.SUPABASE_SERVICE_ROLE_KEY)) return false
  if (!trim(process.env.NEXT_PUBLIC_SUPABASE_URL)) return false
  return true
}

export function getRemoteBPublic(): SbPublic {
  const url = trim(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const anonKey = trim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return { url, anonKey }
}

export function getRemoteBService(): SbService {
  const { url } = getRemoteBPublic()
  const serviceRoleKey = trim(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  }
  return { url, serviceRoleKey }
}

export function getRemoteAPublic(): SbPublic {
  const url =
    trim(process.env.NEXT_PUBLIC_PROD_SUPABASE_URL) ||
    trim(process.env.PROD_SUPABASE_URL)
  const anonKey =
    trim(process.env.NEXT_PUBLIC_PROD_SUPABASE_ANON_KEY) ||
    trim(process.env.PROD_SUPABASE_ANON_KEY)
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_PROD_SUPABASE_URL or NEXT_PUBLIC_PROD_SUPABASE_ANON_KEY')
  }
  return { url, anonKey }
}

export function getRemoteAService(): SbService {
  const { url } = getRemoteAPublic()
  const serviceRoleKey = trim(process.env.PROD_SUPABASE_SERVICE_ROLE_KEY)
  if (!serviceRoleKey) {
    throw new Error('Missing PROD_SUPABASE_SERVICE_ROLE_KEY')
  }
  return { url, serviceRoleKey }
}

export function getActivePublic(): SbPublic {
  return hasRemoteA() ? getRemoteAPublic() : getRemoteBPublic()
}

export function getActiveService(): SbService {
  return hasRemoteA() ? getRemoteAService() : getRemoteBService()
}
