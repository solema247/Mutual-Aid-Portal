import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Server-only helpers to resolve emails from Supabase Auth (auth.users)
 * via the service-role client. Never import this module from client components.
 */

export async function findAuthUserIdsByEmailSearch(
  search: string
): Promise<string[]> {
  const admin = getSupabaseAdmin()
  const ids = new Set<string>()
  const term = search.trim().toLowerCase()
  if (!term || term.length < 2) return []

  // Scan Auth users in bounded pages (max 1000) for email contains / exact match
  try {
    const perPage = 200
    for (let page = 1; page <= 5; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error) break
      const users = data?.users ?? []
      for (const u of users) {
        const email = u.email?.toLowerCase()
        if (!email) continue
        if (email === term || email.includes(term)) ids.add(u.id)
      }
      if (users.length < perPage) break
    }
  } catch (err) {
    console.error('Auth email search scan failed:', err)
  }

  return [...ids]
}

/**
 * Batch-resolve emails for a page of auth_user_ids.
 * Prefers a single auth.users query; falls back to parallel getUserById.
 */
export async function getEmailsByAuthUserIds(
  authUserIds: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const uniqueIds = [
    ...new Set(
      authUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ]
  const map = new Map<string, string>()
  if (uniqueIds.length === 0) return map

  const admin = getSupabaseAdmin()

  // Prefer one PostgREST query against auth.users (service role)
  try {
    const { data, error } = await admin
      .schema('auth')
      .from('users')
      .select('id, email')
      .in('id', uniqueIds)

    if (!error && Array.isArray(data) && data.length > 0) {
      for (const row of data as Array<{ id: string; email: string | null }>) {
        if (row.id && row.email) map.set(row.id, row.email)
      }
      // If we got all ids, done
      if (map.size >= uniqueIds.length) return map
      // Otherwise fill gaps below
    }
  } catch {
    // schema('auth') may be unavailable — fall through
  }

  const missing = uniqueIds.filter((id) => !map.has(id))
  if (missing.length === 0) return map

  const results = await Promise.all(
    missing.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id)
        if (error || !data?.user?.email) return null
        return [id, data.user.email] as const
      } catch {
        return null
      }
    })
  )

  for (const entry of results) {
    if (entry) map.set(entry[0], entry[1])
  }

  return map
}
