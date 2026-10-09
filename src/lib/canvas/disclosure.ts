/**
 * Canvas disclosure — info-type + optional state grants.
 * Server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanvasOrganization } from '@/lib/canvas/types'
import { logAuditEvent } from '@/lib/auditLog'

/** Primary catalog types for Oversight requests. */
export const INFO_RESOURCE_TYPES = [
  'f1',
  'decisions',
  'fund_requests',
  'mous',
  'f4',
  'f5',
] as const

export type InfoResourceType = (typeof INFO_RESOURCE_TYPES)[number]

/** Includes legacy err_project (treated as f1). */
export type DisclosureResourceType = InfoResourceType | 'err_project'

export type DisclosureVisibility = 'disclosed' | 'withheld' | 'hidden'
export type AccessRequestScope = 'record' | 'org_resource_type'
export type AccessRequestStatus = 'pending' | 'approved' | 'denied'

export const INFO_RESOURCE_TYPE_LABELS: Record<InfoResourceType, string> = {
  f1: 'F1 work plans',
  decisions: 'Decisions',
  fund_requests: 'Fund requests',
  mous: 'MOUs',
  f4: 'F4 reports',
  f5: 'F5 reports',
}

export function isInfoResourceType(value: string): value is InfoResourceType {
  return (INFO_RESOURCE_TYPES as readonly string[]).includes(value)
}

/** Normalize legacy err_project → f1 for comparisons. */
export function normalizeResourceType(value: string): InfoResourceType | null {
  if (value === 'err_project') return 'f1'
  if (isInfoResourceType(value)) return value
  return null
}

export type DisclosurePolicy = {
  id: string
  organization_id: string
  resource_type: string
  advertise_existence: boolean
  disclose_content: boolean
  stage_filter: string[] | null
}

export type TypeAccessGrant = {
  resource_type: string
  /** null / empty = all states */
  states: string[] | null
}

export type OversightTypeRow = {
  resource_type: InfoResourceType
  label: string
  visibility: 'disclosed' | 'withheld'
  /** null = all states granted; [] unused; list = partial */
  states_granted: string[] | null
  pending_request_id: string | null
  count: number | null
}

export type OversightProcessorCatalog = {
  organization_id: string
  organization_name: string
  organization_slug: string
  types: OversightTypeRow[]
}

export function isCoordinatorOrg(
  org: Pick<CanvasOrganization, 'org_type'> | { org_type?: string | null } | null | undefined
): boolean {
  return org?.org_type === 'coordinator'
}

export function isProcessorOrg(
  org: Pick<CanvasOrganization, 'org_type'> | { org_type?: string | null } | null | undefined
): boolean {
  return org?.org_type === 'processor'
}

/** null or empty array ⇒ all states */
export function isAllStates(states: string[] | null | undefined): boolean {
  return states == null || states.length === 0
}

export function normalizeStatesInput(states: unknown): string[] | null {
  if (states == null) return null
  if (!Array.isArray(states)) return null
  const cleaned = states
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
  return cleaned.length === 0 ? null : Array.from(new Set(cleaned))
}

export function formatStatesLabel(states: string[] | null | undefined): string {
  if (isAllStates(states)) return 'all states'
  return (states ?? []).join(', ')
}

/**
 * Type-level visibility for Oversight catalog.
 * - disclosed: type grant exists (any states) OR policy.disclose_content
 * - withheld: advertised
 * - hidden: not advertised and no grant
 */
export function canLccSeeInfoType(args: {
  policy: DisclosurePolicy | null
  grant: TypeAccessGrant | null
}): DisclosureVisibility {
  const { policy, grant } = args
  if (grant || policy?.disclose_content === true) return 'disclosed'
  if (policy?.advertise_existence === true) return 'withheld'
  // Default advertise when policy missing but tables exist (seed lag)
  if (!policy) return 'withheld'
  return 'hidden'
}

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /does not exist/i.test(error.message ?? '')
}

export async function getDisclosurePolicy(
  supabase: SupabaseClient,
  processorOrgId: string,
  resourceType: DisclosureResourceType
): Promise<DisclosurePolicy | null> {
  const types = resourceType === 'f1' ? ['f1', 'err_project'] : [resourceType]
  const { data, error } = await supabase
    .from('disclosure_policies')
    .select(
      'id, organization_id, resource_type, advertise_existence, disclose_content, stage_filter'
    )
    .eq('organization_id', processorOrgId)
    .in('resource_type', types)

  if (error) {
    if (tableMissing(error)) return null
    console.error('getDisclosurePolicy', error)
    return null
  }
  const rows = (data ?? []) as DisclosurePolicy[]
  return (
    rows.find((r) => r.resource_type === resourceType) ??
    rows.find((r) => r.resource_type === 'f1') ??
    rows[0] ??
    null
  )
}

export async function listTypePoliciesForOrgs(
  supabase: SupabaseClient,
  orgIds: string[]
): Promise<Map<string, Map<string, DisclosurePolicy>>> {
  const out = new Map<string, Map<string, DisclosurePolicy>>()
  if (orgIds.length === 0) return out

  const { data, error } = await supabase
    .from('disclosure_policies')
    .select(
      'id, organization_id, resource_type, advertise_existence, disclose_content, stage_filter'
    )
    .in('organization_id', orgIds)

  if (error) {
    if (!tableMissing(error)) console.error('listTypePoliciesForOrgs', error)
    return out
  }

  for (const row of data ?? []) {
    const orgMap = out.get(row.organization_id) ?? new Map()
    const norm = normalizeResourceType(row.resource_type) ?? row.resource_type
    // Prefer explicit f1 over legacy err_project
    if (row.resource_type === 'err_project' && orgMap.has('f1')) {
      out.set(row.organization_id, orgMap)
      continue
    }
    orgMap.set(norm, row as DisclosurePolicy)
    out.set(row.organization_id, orgMap)
  }
  return out
}

export async function listTypeGrantsForRequester(
  supabase: SupabaseClient,
  requestingOrgId: string
): Promise<Map<string, Map<string, TypeAccessGrant>>> {
  // Map: targetOrgId → resourceType → grant
  const out = new Map<string, Map<string, TypeAccessGrant>>()
  const { data, error } = await supabase
    .from('access_grants')
    .select('target_organization_id, resource_type, states, resource_id')
    .eq('requesting_organization_id', requestingOrgId)
    .is('resource_id', null)

  if (error) {
    if (!tableMissing(error)) console.error('listTypeGrantsForRequester', error)
    return out
  }

  for (const row of data ?? []) {
    const type = normalizeResourceType(row.resource_type)
    if (!type) continue
    const byType = out.get(row.target_organization_id) ?? new Map()
    byType.set(type, {
      resource_type: type,
      states: row.states ?? null,
    })
    out.set(row.target_organization_id, byType)
  }
  return out
}

async function countForType(
  supabase: SupabaseClient,
  orgId: string,
  resourceType: InfoResourceType
): Promise<number | null> {
  try {
    if (resourceType === 'f1') {
      const { count, error } = await supabase
        .from('err_projects')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('is_draft', false)
      if (error) return null
      return count ?? 0
    }
    if (resourceType === 'decisions') {
      const { count, error } = await supabase
        .from('distribution_decision_master_sheet_1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (error) return null
      return count ?? 0
    }
    if (resourceType === 'mous') {
      const { count, error } = await supabase
        .from('mous')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (error) return null
      return count ?? 0
    }
    if (resourceType === 'f4') {
      const { count, error } = await supabase
        .from('err_summary')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (error) return null
      return count ?? 0
    }
    if (resourceType === 'f5') {
      const { count, error } = await supabase
        .from('err_program_report')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (error) return null
      return count ?? 0
    }
    if (resourceType === 'fund_requests') {
      const { count, error } = await supabase
        .from('fund_requests')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      if (error) return null // pre-006: column missing
      return count ?? 0
    }
    return null
  } catch {
    return null
  }
}

export async function listOversightCatalogForCoordinator(
  supabase: SupabaseClient,
  viewerOrgId: string
): Promise<{ processors: OversightProcessorCatalog[]; unavailable: boolean }> {
  const { data: processorOrgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, slug, org_type')
    .eq('org_type', 'processor')
    .eq('is_active', true)
    .order('name')

  if (orgError) {
    if (tableMissing(orgError)) return { processors: [], unavailable: true }
    console.error('listOversightCatalogForCoordinator orgs', orgError)
    return { processors: [], unavailable: true }
  }

  const orgs = processorOrgs ?? []
  if (orgs.length === 0) return { processors: [], unavailable: false }

  const orgIds = orgs.map((o) => o.id)
  const policiesByOrg = await listTypePoliciesForOrgs(supabase, orgIds)
  if (policiesByOrg.size === 0) {
    const sample = await supabase.from('disclosure_policies').select('id').limit(1)
    if (sample.error && tableMissing(sample.error)) {
      return { processors: [], unavailable: true }
    }
  }

  const grantsByOrg = await listTypeGrantsForRequester(supabase, viewerOrgId)

  const { data: pendingReqs } = await supabase
    .from('access_requests')
    .select('id, target_organization_id, resource_type')
    .eq('requesting_organization_id', viewerOrgId)
    .eq('scope', 'org_resource_type')
    .eq('status', 'pending')

  const pendingKey = new Map<string, string>()
  for (const r of pendingReqs ?? []) {
    const type = normalizeResourceType(r.resource_type)
    if (!type) continue
    pendingKey.set(`${r.target_organization_id}:${type}`, r.id)
  }

  const processors: OversightProcessorCatalog[] = []

  for (const org of orgs) {
    const policyMap = policiesByOrg.get(org.id) ?? new Map()
    const grantMap = grantsByOrg.get(org.id) ?? new Map()
    const types: OversightTypeRow[] = []

    for (const resourceType of INFO_RESOURCE_TYPES) {
      const policy = policyMap.get(resourceType) ?? null
      const grant = grantMap.get(resourceType) ?? null
      const visibility = canLccSeeInfoType({ policy, grant })
      if (visibility === 'hidden') continue

      const count = await countForType(supabase, org.id, resourceType)
      types.push({
        resource_type: resourceType,
        label: INFO_RESOURCE_TYPE_LABELS[resourceType],
        visibility,
        states_granted:
          visibility === 'disclosed'
            ? grant
              ? isAllStates(grant.states)
                ? null
                : grant.states
              : null
            : null,
        pending_request_id: pendingKey.get(`${org.id}:${resourceType}`) ?? null,
        count,
      })
    }

    if (types.length > 0) {
      processors.push({
        organization_id: org.id,
        organization_name: org.name,
        organization_slug: org.slug,
        types,
      })
    }
  }

  return { processors, unavailable: false }
}

export async function emitAccessRequestAudit(args: {
  action: 'access_request.created' | 'access_request.decided' | 'access_request.revoked'
  actorUserId: string
  requestId: string
  endpoint: string
  request?: Request | null
  metadata?: Record<string, unknown> | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
}): Promise<void> {
  await logAuditEvent({
    action: args.action,
    actorUserId: args.actorUserId,
    resolveActor: false,
    targetType: 'access_request',
    targetId: args.requestId,
    oldValues: args.oldValues ?? null,
    newValues: args.newValues ?? null,
    metadata: {
      source: 'user',
      endpoint: args.endpoint,
      ...(args.metadata ?? {}),
    },
    request: args.request ?? null,
  })
}
