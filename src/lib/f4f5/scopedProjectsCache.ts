import { createHash } from 'crypto'
import type { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import type { F4F5ListScope } from './listScope'
import { fetchScopedProjects } from './listCommon'

/** Short-lived in-process cache for F4/F5 scoped project loads only. */
export const F4F5_SCOPED_PROJECTS_CACHE_TTL_MS = 60_000

const MAX_CACHE_ENTRIES = 256

type CacheEntry = {
  projects: Record<string, unknown>[]
  expiresAt: number
  storedAt: number
}

const cache = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<Record<string, unknown>[]>>()

function scopeFetchOpts(scope: F4F5ListScope) {
  return {
    grantGridIds: scope.grantGridIds,
    allowedStateNames: scope.allowedStateNames,
    useStateScope: scope.useStateScope,
    emergencyRoomId: scope.emergencyRoomId,
  }
}

/**
 * Stable cache key: authenticated user + effective F4/F5 scope (never role alone).
 */
export function buildScopedProjectsCacheKey(userId: string, scope: F4F5ListScope): string {
  const grantMode = scope.grantAccess.mode
  const grids =
    scope.grantGridIds === null
      ? 'all-grants'
      : [...scope.grantGridIds].sort().join('\u001f')
  const room = scope.emergencyRoomId ?? 'no-room-filter'
  const stateSegment =
    scope.allowedStateNames === null
      ? 'states:all'
      : `states:${[...scope.allowedStateNames].sort().join('\u001f')}`
  const adminSegment =
    grantMode === 'all' && scope.emergencyRoomId === null && scope.grantGridIds === null
      ? 'segment:admin-all'
      : grantMode === 'all'
        ? 'segment:all-other'
        : grantMode === 'partner'
          ? 'segment:partner'
          : 'segment:none'

  return [
    `u:${userId}`,
    `grantMode:${grantMode}`,
    `grids:${grids}`,
    `room:${room}`,
    `useStateScope:${scope.useStateScope ? 1 : 0}`,
    stateSegment,
    adminSegment,
  ].join('|')
}

export function scopedProjectsCacheKeyFingerprint(cacheKey: string): string {
  return createHash('sha256').update(cacheKey).digest('hex').slice(0, 16)
}

function debugEnabled(): boolean {
  return process.env.F4F5_SCOPE_CACHE_DEBUG === '1'
}

function debugLog(
  event: 'HIT' | 'MISS' | 'INFLIGHT_JOIN' | 'STORE' | 'FETCH_ERROR',
  endpoint: 'f4' | 'f5',
  cacheKey: string,
  extra: { count?: number; ageMs?: number; ttlMs?: number }
) {
  if (!debugEnabled()) return
  const fp = scopedProjectsCacheKeyFingerprint(cacheKey)
  console.info('[f4f5-scoped-projects-cache]', {
    event,
    endpoint,
    keyFingerprint: fp,
    projectCount: extra.count,
    ageMs: extra.ageMs,
    ttlMs: extra.ttlMs ?? F4F5_SCOPED_PROJECTS_CACHE_TTL_MS,
  })
}

function cloneProjects(projects: Record<string, unknown>[]): Record<string, unknown>[] {
  return structuredClone(projects)
}

function purgeExpiredEntries(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key)
  }
}

function enforceMaxEntries() {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const sorted = [...cache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt)
  while (cache.size > MAX_CACHE_ENTRIES && sorted.length > 0) {
    const [key] = sorted.shift()!
    cache.delete(key)
  }
}

/**
 * Cached wrapper around fetchScopedProjects. Call only after requirePermission
 * and after confirming !scope.isEmpty.
 */
export async function fetchScopedProjectsCached(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  scope: F4F5ListScope,
  userId: string,
  endpoint: 'f4' | 'f5'
): Promise<Record<string, unknown>[]> {
  if (scope.isEmpty) {
    return []
  }

  const cacheKey = buildScopedProjectsCacheKey(userId, scope)
  const now = Date.now()
  purgeExpiredEntries(now)

  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > now) {
    debugLog('HIT', endpoint, cacheKey, {
      count: hit.projects.length,
      ageMs: now - hit.storedAt,
      ttlMs: hit.expiresAt - now,
    })
    return cloneProjects(hit.projects)
  }
  if (hit) cache.delete(cacheKey)

  const pending = inflight.get(cacheKey)
  if (pending) {
    debugLog('INFLIGHT_JOIN', endpoint, cacheKey, {})
    const projects = await pending
    return cloneProjects(projects)
  }

  debugLog('MISS', endpoint, cacheKey, {})

  const fetchPromise = (async () => {
    const projects = await fetchScopedProjects(supabase, scopeFetchOpts(scope))
    const stored = cloneProjects(projects)
    cache.set(cacheKey, {
      projects: stored,
      expiresAt: Date.now() + F4F5_SCOPED_PROJECTS_CACHE_TTL_MS,
      storedAt: Date.now(),
    })
    enforceMaxEntries()
    debugLog('STORE', endpoint, cacheKey, { count: stored.length })
    return stored
  })()

  inflight.set(cacheKey, fetchPromise)

  try {
    const projects = await fetchPromise
    return cloneProjects(projects)
  } catch (err) {
    debugLog('FETCH_ERROR', endpoint, cacheKey, {})
    throw err
  } finally {
    inflight.delete(cacheKey)
  }
}

/** Test-only: reset module state. */
export function __resetScopedProjectsCacheForTests() {
  cache.clear()
  inflight.clear()
}
