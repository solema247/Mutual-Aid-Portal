import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createSbRouteClient } from '@/lib/sbRoute'
import { resolveEnvironmentForUser } from '@/lib/canvas/resolveEnvironment'
import { roleBypassesMountGating } from '@/lib/canvas/types'

/**
 * Canvas org data plane (Phase 2).
 * Outer ring around grant/room/state scope: processor users only see/write
 * pipeline rows for their session organization.
 *
 * mode 'all' — canvas unavailable / fallback (staging or pre-SQL): no org filter
 * mode 'org' — filter/write with organizationId
 * mode 'none' — authenticated but no usable org (fail closed)
 */
export type UserOrgScope =
  | { mode: 'all'; organizationId: null }
  | { mode: 'org'; organizationId: string }
  | { mode: 'none'; organizationId: null }

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

  return { mode: 'org', organizationId: canvas.organization.id }
}

/** Apply organization_id equality when scope is org-bound. */
export function applyOrganizationIdFilter<
  T extends { eq: (column: string, value: string) => T },
>(query: T, scope: UserOrgScope, column: string = 'organization_id'): T {
  if (scope.mode !== 'org') return query
  return query.eq(column, scope.organizationId)
}

/**
 * For list endpoints: if scope is none, return empty immediately.
 * If all, no filter. If org, caller must applyOrganizationIdFilter.
 */
export function orgScopeBlocksAllData(scope: UserOrgScope): boolean {
  return scope.mode === 'none'
}

/** Merge organization_id onto insert/update payloads when org-scoped. */
export function withOrganizationId<T extends Record<string, unknown>>(
  payload: T,
  scope: UserOrgScope
): T {
  if (scope.mode !== 'org') return payload
  return { ...payload, organization_id: scope.organizationId }
}

export function organizationIdMatchesScope(
  scope: UserOrgScope,
  rowOrganizationId: string | null | undefined
): boolean {
  if (scope.mode === 'all') return true
  if (scope.mode === 'none') return false
  if (rowOrganizationId == null || String(rowOrganizationId).trim() === '') {
    // Legacy null rows: fail closed once canvas is live (backfill should have set them)
    return false
  }
  return String(rowOrganizationId) === scope.organizationId
}

export function orgScopeForbiddenResponse(
  message = 'Forbidden — outside your organization scope'
): NextResponse {
  return NextResponse.json({ error: message, code: 'ORG_SCOPE_DENIED' }, { status: 403 })
}
