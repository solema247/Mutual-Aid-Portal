import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createSbRouteClient } from '@/lib/sbRoute'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveEnvironmentForUser } from '@/lib/canvas/resolveEnvironment'
import {
  isAllStates,
  listTypeGrantsForRequester,
  normalizeResourceType,
  type InfoResourceType,
} from '@/lib/canvas/disclosure'
import { roleBypassesMountGating } from '@/lib/canvas/types'

/**
 * Canvas org data plane.
 * - processor: own organization_id only
 * - coordinator: data from access_grants (processor orgs × types × states)
 * - fallback: mode 'all' (staging / pre-SQL)
 */
export type UserOrgScope =
  | { mode: 'all'; organizationId: null }
  | { mode: 'org'; organizationId: string }
  | { mode: 'none'; organizationId: null }
  | {
      mode: 'disclosed'
      organizationId: null
      requestingOrganizationId: string
      /** Processor orgs with ≥1 type grant */
      allowedOrganizationIds: string[]
      /** targetOrgId → resourceType → states (null = all states) */
      grantsByOrgType: Record<string, Record<string, string[] | null>>
    }

const ALL_SCOPE: UserOrgScope = { mode: 'all', organizationId: null }
const NONE_SCOPE: UserOrgScope = { mode: 'none', organizationId: null }

export async function getUserOrgScope(
  supabase?: SupabaseClient
): Promise<UserOrgScope> {
  const client = supabase ?? createSbRouteClient()
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError || !session) {
    return NONE_SCOPE
  }

  const { data: userRow, error } = await client
    .from('users')
    .select('id, role')
    .eq('auth_user_id', session.user.id)
    .single()

  if (error || !userRow) {
    return NONE_SCOPE
  }

  const canvas = await resolveEnvironmentForUser(client, userRow.id, {
    bypassMountGating: roleBypassesMountGating(userRow.role),
  })

  // Staging / pre-migration: do not break existing queries
  if (canvas.is_fallback || !canvas.organization.id) {
    return ALL_SCOPE
  }

  // Coordinators only see processor data they've been granted
  if (canvas.organization.org_type === 'coordinator') {
    const grants = await listTypeGrantsForRequester(client, canvas.organization.id)
    const grantsByOrgType: Record<string, Record<string, string[] | null>> = {}
    const allowedOrganizationIds: string[] = []

    for (const [targetOrgId, byType] of grants.entries()) {
      const typeMap: Record<string, string[] | null> = {}
      for (const [type, grant] of byType.entries()) {
        typeMap[type] = isAllStates(grant.states) ? null : grant.states
      }
      if (Object.keys(typeMap).length === 0) continue
      grantsByOrgType[targetOrgId] = typeMap
      allowedOrganizationIds.push(targetOrgId)
    }

    return {
      mode: 'disclosed',
      organizationId: null,
      requestingOrganizationId: canvas.organization.id,
      allowedOrganizationIds,
      grantsByOrgType,
    }
  }

  return { mode: 'org', organizationId: canvas.organization.id }
}

/** Orgs that granted a given info type (empty ⇒ no access for that type). */
export function orgIdsGrantedForType(
  scope: UserOrgScope,
  resourceType: InfoResourceType | string
): string[] {
  const type = normalizeResourceType(String(resourceType)) ?? String(resourceType)
  if (scope.mode === 'org') return [scope.organizationId]
  if (scope.mode === 'all') return [] // caller must not filter by org
  if (scope.mode === 'none') return []
  const out: string[] = []
  for (const orgId of scope.allowedOrganizationIds) {
    if (scope.grantsByOrgType[orgId]?.[type] !== undefined) out.push(orgId)
  }
  return out
}

/** States granted for org+type; null = all states; [] = none. */
export function statesGrantedForOrgType(
  scope: UserOrgScope,
  organizationId: string,
  resourceType: InfoResourceType | string
): string[] | null | undefined {
  if (scope.mode === 'all' || scope.mode === 'org') return null
  if (scope.mode === 'none') return []
  const type = normalizeResourceType(String(resourceType)) ?? String(resourceType)
  const states = scope.grantsByOrgType[organizationId]?.[type]
  if (states === undefined) return []
  return states // null = all
}

export function hasDisclosureGrant(
  scope: UserOrgScope,
  resourceType: InfoResourceType | string
): boolean {
  if (scope.mode === 'all' || scope.mode === 'org') return true
  if (scope.mode === 'none') return false
  return orgIdsGrantedForType(scope, resourceType).length > 0
}

/**
 * Apply organization_id filter.
 * For disclosed coordinators, pass resourceType so only orgs that granted that type are included.
 */
export function applyOrganizationIdFilter<
  T extends {
    eq: (column: string, value: string) => T
    in: (column: string, values: string[]) => T
  },
>(
  query: T,
  scope: UserOrgScope,
  column: string = 'organization_id',
  resourceType?: InfoResourceType | string
): T {
  if (scope.mode === 'org') {
    return query.eq(column, scope.organizationId)
  }
  if (scope.mode === 'disclosed') {
    const ids = resourceType
      ? orgIdsGrantedForType(scope, resourceType)
      : scope.allowedOrganizationIds
    if (ids.length === 0) {
      // Impossible match — fail closed
      return query.eq(column, '00000000-0000-0000-0000-000000000000')
    }
    return query.in(column, ids)
  }
  return query
}

/** Post-filter rows by per-org state grants for a resource type. */
export function filterRowsByDisclosureStates<T extends Record<string, unknown>>(
  rows: T[],
  scope: UserOrgScope,
  resourceType: InfoResourceType | string,
  opts?: {
    organizationIdKey?: keyof T
    stateKey?: keyof T
  }
): T[] {
  if (scope.mode !== 'disclosed') return rows
  const orgKey = (opts?.organizationIdKey ?? 'organization_id') as string
  const stateKey = (opts?.stateKey ?? 'state') as string
  const type = normalizeResourceType(String(resourceType)) ?? String(resourceType)

  return rows.filter((row) => {
    const orgId = row[orgKey]
    if (typeof orgId !== 'string' || !orgId) return false
    const states = scope.grantsByOrgType[orgId]?.[type]
    if (states === undefined) return false
    if (states == null || states.length === 0) return true // all states
    const state = row[stateKey]
    if (typeof state !== 'string' || !state) return false
    return states.includes(state)
  })
}

/**
 * Stable cache segment for disclosed scopes (avoids sharing LoHub caches with LCC).
 */
export function orgScopeCacheKey(scope: UserOrgScope): string {
  if (scope.mode === 'org') return `org:${scope.organizationId}`
  if (scope.mode === 'all') return 'org:all'
  if (scope.mode === 'none') return 'org:none'
  const parts: string[] = [`coord:${scope.requestingOrganizationId}`]
  for (const orgId of [...scope.allowedOrganizationIds].sort()) {
    const types = scope.grantsByOrgType[orgId] ?? {}
    for (const type of Object.keys(types).sort()) {
      const st = types[type]
      const stKey = st == null || st.length === 0 ? '*' : [...st].sort().join('+')
      parts.push(`${orgId}:${type}:${stKey}`)
    }
  }
  return parts.join('|')
}

/**
 * For list endpoints: if scope is none, or disclosed with no grants, return empty.
 */
export function orgScopeBlocksAllData(scope: UserOrgScope): boolean {
  if (scope.mode === 'none') return true
  if (scope.mode === 'disclosed' && scope.allowedOrganizationIds.length === 0) {
    return true
  }
  return false
}

/** True when coordinator disclosed scope has no grant for this type. */
export function orgScopeBlocksResourceType(
  scope: UserOrgScope,
  resourceType: InfoResourceType | string
): boolean {
  if (orgScopeBlocksAllData(scope)) return true
  if (scope.mode === 'disclosed') {
    return orgIdsGrantedForType(scope, resourceType).length === 0
  }
  return false
}

/** Merge organization_id onto insert/update payloads when org-scoped (processors only). */
export function withOrganizationId<T extends Record<string, unknown>>(
  payload: T,
  scope: UserOrgScope
): T {
  if (scope.mode !== 'org') return payload
  return { ...payload, organization_id: scope.organizationId }
}

export function organizationIdMatchesScope(
  scope: UserOrgScope,
  rowOrganizationId: string | null | undefined,
  resourceType?: InfoResourceType | string
): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (rowOrganizationId == null || String(rowOrganizationId).trim() === '') {
    return false
  }
  const orgId = String(rowOrganizationId)
  if (scope.mode === 'org') {
    return orgId === scope.organizationId
  }
  // disclosed
  if (resourceType) {
    return orgIdsGrantedForType(scope, resourceType).includes(orgId)
  }
  return scope.allowedOrganizationIds.includes(orgId)
}

export function orgScopeForbiddenResponse(
  message = 'Forbidden — outside your organization scope'
): NextResponse {
  return NextResponse.json({ error: message, code: 'ORG_SCOPE_DENIED' }, { status: 403 })
}

/** Coordinators may read granted data but not mutate processor pipeline rows. */
export function coordinatorWriteForbiddenResponse(
  message = 'Coordinator organizations cannot modify processor data'
): NextResponse {
  return NextResponse.json({ error: message, code: 'COORDINATOR_READ_ONLY' }, { status: 403 })
}

export function isDisclosedCoordinator(scope: UserOrgScope): boolean {
  return scope.mode === 'disclosed'
}

/** Session tenant org id (processor own org, or coordinator’s own org — not granted processors). */
export function sessionOrganizationId(scope: UserOrgScope): string | null {
  if (scope.mode === 'org') return scope.organizationId
  if (scope.mode === 'disclosed') return scope.requestingOrganizationId
  return null
}

/**
 * User ids that are members of the session organization.
 * Uses the service-role client because RLS on organization_memberships
 * only allows selecting the caller's own row.
 */
export async function loadSessionOrgMemberUserIds(
  _supabase: SupabaseClient,
  scope: UserOrgScope
): Promise<string[] | null> {
  const orgId = sessionOrganizationId(scope)
  if (!orgId) return null
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', orgId)
    if (error) {
      console.error('loadSessionOrgMemberUserIds', error)
      return []
    }
    return (data ?? []).map((r) => r.user_id).filter(Boolean)
  } catch (e) {
    console.error('loadSessionOrgMemberUserIds admin:', e)
    return []
  }
}

/**
 * Support / superadmin / fallback (mode all) see portal-wide users & audit.
 * Admins in an org (or coordinator session org) are membership-scoped.
 */
export function shouldScopeUsersToSessionOrg(
  scope: UserOrgScope,
  callerRole: string
): boolean {
  if (callerRole === 'support' || callerRole === 'superadmin') return false
  return sessionOrganizationId(scope) != null
}

/**
 * True when userId has membership in the session organization.
 * Uses service role (same RLS limitation as loadSessionOrgMemberUserIds).
 */
export async function isUserInSessionOrg(
  _supabase: SupabaseClient,
  scope: UserOrgScope,
  userId: string
): Promise<boolean> {
  const orgId = sessionOrganizationId(scope)
  if (!orgId) return true
  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('organization_memberships')
      .select('user_id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.error('isUserInSessionOrg', error)
      return false
    }
    return !!data?.user_id
  } catch (e) {
    console.error('isUserInSessionOrg admin:', e)
    return false
  }
}

/**
 * Prefer decisions-granted orgs for Grants module; fall back to any granted processor org.
 */
export function orgIdsForGrantsModule(scope: UserOrgScope): string[] {
  if (scope.mode === 'org') return [scope.organizationId]
  if (scope.mode !== 'disclosed') return []
  const decisions = orgIdsGrantedForType(scope, 'decisions')
  if (decisions.length > 0) return decisions
  return scope.allowedOrganizationIds
}
