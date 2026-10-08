import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyOrganizationIdFilter,
  isDisclosedCoordinator,
  organizationIdMatchesScope,
  orgScopeBlocksAllData,
  orgScopeBlocksResourceType,
  withOrganizationId,
  type UserOrgScope,
} from '@/lib/canvas/orgScope'

/**
 * Fund requests / FSPs are org-owned (`sql/canvas/006_fund_requests_fsps_organization_id.sql`).
 * Processors: own organization_id. Coordinators: fund_requests via access_grants; FSPs empty.
 */
export function treasuryListBlocked(scope: UserOrgScope, kind: 'fund_requests' | 'fsps'): boolean {
  if (orgScopeBlocksAllData(scope)) return true
  if (kind === 'fund_requests') {
    return orgScopeBlocksResourceType(scope, 'fund_requests')
  }
  // FSPs are processor admin config — not disclosure-driven
  return isDisclosedCoordinator(scope)
}

export function applyTreasuryOrgFilter<
  T extends {
    eq: (column: string, value: string) => T
    in: (column: string, values: string[]) => T
  },
>(query: T, scope: UserOrgScope, kind: 'fund_requests' | 'fsps'): T {
  if (scope.mode === 'all') return query
  if (kind === 'fund_requests') {
    return applyOrganizationIdFilter(query, scope, 'organization_id', 'fund_requests')
  }
  return applyOrganizationIdFilter(query, scope, 'organization_id')
}

export function stampTreasuryOrganizationId<T extends Record<string, unknown>>(
  payload: T,
  scope: UserOrgScope
): T {
  return withOrganizationId(payload, scope)
}

/** Assert a fund_request / fsp row is in scope (for GET/PUT/DELETE by id). */
export async function assertTreasuryRowInScope(
  supabase: SupabaseClient,
  scope: UserOrgScope,
  table: 'fund_requests' | 'fsps',
  id: string
): Promise<'ok' | 'missing' | 'forbidden'> {
  if (treasuryListBlocked(scope, table)) return 'forbidden'
  if (scope.mode === 'all') return 'ok'

  const { data, error } = await supabase
    .from(table)
    .select('id, organization_id')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('assertTreasuryRowInScope', error)
    return 'forbidden'
  }
  if (!data) return 'missing'

  const resourceType = table === 'fund_requests' ? 'fund_requests' : undefined
  if (
    !organizationIdMatchesScope(
      scope,
      data.organization_id as string | null,
      resourceType
    )
  ) {
    return 'forbidden'
  }
  return 'ok'
}
