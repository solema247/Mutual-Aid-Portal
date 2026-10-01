import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Server-only helpers to resolve emails from Supabase Auth (auth.users)
 * via the service-role client. Never import this module from client components.
 *
 * Default path: Supabase Auth Admin API (listUsers / getUserById).
 * PostgREST auth.users is opt-in only (AUDIT_LOG_AUTH_POSTGREST=1) for environments
 * where the auth schema is exposed — not used on hosted Supabase (PGRST106).
 */

const AUTH_EMAIL_LOOKUP_LIMIT = 200
const LIST_USERS_PER_PAGE = 200
const LIST_USERS_MAX_PAGES = 5

export type AuthEmailAdminMetrics = {
  listUsersCalls: number
  listUsersPages: number
  getUserByIdCalls: number
  postgrestAttempts: number
}

export function createAuthEmailAdminMetrics(): AuthEmailAdminMetrics {
  return {
    listUsersCalls: 0,
    listUsersPages: 0,
    getUserByIdCalls: 0,
    postgrestAttempts: 0,
  }
}

function authPostgrestEnabled(): boolean {
  return process.env.AUDIT_LOG_AUTH_POSTGREST === '1'
}

function normalizeEmailSearchTerm(search: string): string {
  return search.trim().toLowerCase()
}

/** Escape `%` / `_` for SQL ILIKE (audit search already strips wildcards). */
function ilikePatternContains(term: string): string {
  const escaped = term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  return `%${escaped}%`
}

type AuthUserEmailRow = { id: string; email: string | null }

async function queryAuthUsersByEmailIlike(
  term: string,
  collect: Map<string, string> | undefined,
  metrics: AuthEmailAdminMetrics | undefined
): Promise<{ ids: string[]; querySucceeded: boolean }> {
  if (metrics) metrics.postgrestAttempts += 1
  const admin = getSupabaseAdmin()
  const pattern = ilikePatternContains(term)
  const ids: string[] = []

  try {
    const { data, error } = await admin
      .schema('auth')
      .from('users')
      .select('id, email')
      .ilike('email', pattern)
      .limit(AUTH_EMAIL_LOOKUP_LIMIT)

    if (error || !Array.isArray(data)) {
      return { ids: [], querySucceeded: false }
    }

    for (const row of data as AuthUserEmailRow[]) {
      if (!row.id) continue
      ids.push(row.id)
      const email = row.email?.trim()
      if (email && collect) collect.set(row.id, email)
    }
    return { ids, querySucceeded: true }
  } catch {
    return { ids: [], querySucceeded: false }
  }
}

async function queryAuthUsersByIdsPostgrest(
  authUserIds: string[],
  into: Map<string, string>,
  metrics: AuthEmailAdminMetrics | undefined
): Promise<boolean> {
  if (authUserIds.length === 0) return true
  if (metrics) metrics.postgrestAttempts += 1
  const admin = getSupabaseAdmin()
  try {
    const { data, error } = await admin
      .schema('auth')
      .from('users')
      .select('id, email')
      .in('id', authUserIds)

    if (error || !Array.isArray(data)) return false

    for (const row of data as AuthUserEmailRow[]) {
      if (row.id && row.email) into.set(row.id, row.email)
    }
    return true
  } catch {
    return false
  }
}

function emailMatchesSearchTerm(email: string, term: string): boolean {
  const lower = email.toLowerCase()
  if (term.includes('@')) {
    return lower === term || lower.includes(term)
  }
  return lower === term || lower.includes(term)
}

/**
 * Scan Auth users (bounded pages) for email search matches; fills collect map.
 */
async function listAuthUserIdsByEmailScan(
  term: string,
  collect: Map<string, string> | undefined,
  metrics: AuthEmailAdminMetrics | undefined
): Promise<string[]> {
  const admin = getSupabaseAdmin()
  const ids = new Set<string>()

  try {
    for (let page = 1; page <= LIST_USERS_MAX_PAGES; page += 1) {
      if (metrics) metrics.listUsersPages += 1
      if (metrics) metrics.listUsersCalls += 1
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: LIST_USERS_PER_PAGE,
      })
      if (error) break
      const users = data?.users ?? []
      for (const u of users) {
        const email = u.email
        if (!email) continue
        if (emailMatchesSearchTerm(email, term)) {
          ids.add(u.id)
          if (collect) collect.set(u.id, email)
        }
      }
      if (users.length < LIST_USERS_PER_PAGE) break
    }
  } catch (err) {
    console.error('Auth email search scan failed:', err)
  }

  return [...ids]
}

/**
 * Resolve emails for specific auth user IDs via listUsers pages (batched).
 * Stops early when all IDs are found or pages are exhausted.
 */
async function resolveEmailsViaListUsersScan(
  neededIds: Set<string>,
  into: Map<string, string>,
  metrics: AuthEmailAdminMetrics | undefined
): Promise<void> {
  if (neededIds.size === 0) return
  const admin = getSupabaseAdmin()

  try {
    for (let page = 1; page <= LIST_USERS_MAX_PAGES && neededIds.size > 0; page += 1) {
      if (metrics) metrics.listUsersPages += 1
      if (metrics) metrics.listUsersCalls += 1
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: LIST_USERS_PER_PAGE,
      })
      if (error) break
      const users = data?.users ?? []
      for (const u of users) {
        if (neededIds.has(u.id) && u.email) {
          into.set(u.id, u.email)
          neededIds.delete(u.id)
        }
      }
      if (users.length < LIST_USERS_PER_PAGE) break
    }
  } catch (err) {
    console.error('Auth listUsers enrichment scan failed:', err)
  }
}

async function resolveEmailsViaGetUserById(
  authUserIds: string[],
  into: Map<string, string>,
  metrics: AuthEmailAdminMetrics | undefined
): Promise<void> {
  const admin = getSupabaseAdmin()
  const missing = authUserIds.filter((id) => !into.has(id))
  if (missing.length === 0) return

  if (metrics) metrics.getUserByIdCalls += missing.length

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
    if (entry) into.set(entry[0], entry[1])
  }
}

export async function findAuthUserIdsByEmailSearch(
  search: string,
  collect?: Map<string, string>,
  metrics?: AuthEmailAdminMetrics
): Promise<string[]> {
  const term = normalizeEmailSearchTerm(search)
  if (!term || term.length < 2) return []

  if (authPostgrestEnabled()) {
    const postgrest = await queryAuthUsersByEmailIlike(term, collect, metrics)
    if (postgrest.querySucceeded) return postgrest.ids
  }

  return listAuthUserIdsByEmailScan(term, collect, metrics)
}

/**
 * Batch-resolve emails for auth_user_ids.
 * Optional seed map reuses emails resolved during search (avoids duplicate Auth work).
 */
export async function getEmailsByAuthUserIds(
  authUserIds: Array<string | null | undefined>,
  seed?: ReadonlyMap<string, string>,
  metrics?: AuthEmailAdminMetrics
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (seed) {
    for (const [id, email] of seed) {
      if (id && email) map.set(id, email)
    }
  }

  const uniqueIds = [
    ...new Set(
      authUserIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ].filter((id) => !map.has(id))

  if (uniqueIds.length === 0) return map

  let unresolved = [...uniqueIds]

  if (authPostgrestEnabled()) {
    const ok = await queryAuthUsersByIdsPostgrest(unresolved, map, metrics)
    if (ok) {
      unresolved = unresolved.filter((id) => !map.has(id))
      if (unresolved.length === 0) return map
    }
  }

  const needed = new Set(unresolved)
  await resolveEmailsViaListUsersScan(needed, map, metrics)

  unresolved = unresolved.filter((id) => !map.has(id))
  if (unresolved.length > 0) {
    await resolveEmailsViaGetUserById(unresolved, map, metrics)
  }

  return map
}
