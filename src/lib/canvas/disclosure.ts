/**
 * Canvas Phase 3 — disclosure policies and LCC visibility helpers.
 * Server-side only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CanvasOrganization } from '@/lib/canvas/types'
import { logAuditEvent } from '@/lib/auditLog'

export type DisclosureResourceType = 'err_project'
export type DisclosureVisibility = 'disclosed' | 'withheld' | 'hidden'
export type AccessRequestScope = 'record' | 'org_resource_type'
export type AccessRequestStatus = 'pending' | 'approved' | 'denied'

export type DisclosurePolicy = {
  id: string
  organization_id: string
  resource_type: DisclosureResourceType
  advertise_existence: boolean
  disclose_content: boolean
  stage_filter: string[] | null
}

export type ProjectExistenceStub = {
  id: string
  organization_id: string
  owning_org_name: string
  state: string | null
  locality: string | null
  err_code: string | null
  funding_status: string | null
  status: string
  date: string | null
}

/** Disclosed project shape — still omits expenses/files in oversight list MVP. */
export type ProjectDisclosedSummary = ProjectExistenceStub & {
  project_name: string | null
  grant_serial: string | null
  workplan_number: number | null
  project_objectives: string | null
  estimated_beneficiaries: number | null
  'Sector (Primary)': string | null
}

export type OversightProjectRow = {
  visibility: 'disclosed' | 'withheld'
  project: ProjectDisclosedSummary | ProjectExistenceStub
  pending_request_id: string | null
  has_access_grant: boolean
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

function matchesStageFilter(
  fundingStatus: string | null | undefined,
  stageFilter: string[] | null | undefined
): boolean {
  if (!stageFilter || stageFilter.length === 0) return true
  const status = (fundingStatus ?? '').trim().toLowerCase()
  return stageFilter.some((s) => s.trim().toLowerCase() === status)
}

/**
 * Resolve LCC visibility for one processor project.
 * - disclosed: org-wide disclose_content OR per-record access_grant
 * - withheld: advertise_existence and stage match, but content locked
 * - hidden: not advertised and no grant
 */
export function canLccSeeProjectContent(args: {
  project: {
    id: string
    organization_id: string | null
    funding_status?: string | null
  }
  viewerOrgId: string
  policy: DisclosurePolicy | null
  hasAccessGrant: boolean
}): DisclosureVisibility {
  const { project, policy, hasAccessGrant } = args
  if (!project.organization_id) return 'hidden'

  if (hasAccessGrant || policy?.disclose_content === true) {
    return 'disclosed'
  }

  if (!policy || !policy.advertise_existence) {
    return 'hidden'
  }

  if (!matchesStageFilter(project.funding_status, policy.stage_filter)) {
    return 'hidden'
  }

  return 'withheld'
}

export function toExistenceStub(
  project: {
    id: string
    organization_id: string | null
    state?: string | null
    locality?: string | null
    funding_status?: string | null
    status?: string | null
    date?: string | null
    emergency_rooms?: { err_code?: string | null } | null
  },
  owningOrgName: string
): ProjectExistenceStub {
  return {
    id: project.id,
    organization_id: project.organization_id ?? '',
    owning_org_name: owningOrgName,
    state: project.state ?? null,
    locality: project.locality ?? null,
    err_code: project.emergency_rooms?.err_code ?? null,
    funding_status: project.funding_status ?? null,
    status: project.status ?? '',
    date: project.date ?? null,
  }
}

export function toDisclosedSummary(
  project: {
    id: string
    organization_id: string | null
    state?: string | null
    locality?: string | null
    funding_status?: string | null
    status?: string | null
    date?: string | null
    project_name?: string | null
    grant_serial?: string | null
    workplan_number?: number | null
    project_objectives?: string | null
    estimated_beneficiaries?: number | null
    'Sector (Primary)'?: string | null
    emergency_rooms?: { err_code?: string | null } | null
  },
  owningOrgName: string
): ProjectDisclosedSummary {
  return {
    ...toExistenceStub(project, owningOrgName),
    project_name: project.project_name ?? null,
    grant_serial: project.grant_serial ?? null,
    workplan_number: project.workplan_number ?? null,
    project_objectives: project.project_objectives ?? null,
    estimated_beneficiaries: project.estimated_beneficiaries ?? null,
    'Sector (Primary)': project['Sector (Primary)'] ?? null,
  }
}

export async function getDisclosurePolicy(
  supabase: SupabaseClient,
  processorOrgId: string,
  resourceType: DisclosureResourceType = 'err_project'
): Promise<DisclosurePolicy | null> {
  const { data, error } = await supabase
    .from('disclosure_policies')
    .select(
      'id, organization_id, resource_type, advertise_existence, disclose_content, stage_filter'
    )
    .eq('organization_id', processorOrgId)
    .eq('resource_type', resourceType)
    .maybeSingle()

  if (error) {
    // Missing table (staging) or other soft failure
    if (error.code === '42P01' || /does not exist/i.test(error.message ?? '')) {
      return null
    }
    console.error('getDisclosurePolicy', error)
    return null
  }
  if (!data) return null
  return data as DisclosurePolicy
}

export async function getDisclosurePoliciesForOrgs(
  supabase: SupabaseClient,
  orgIds: string[],
  resourceType: DisclosureResourceType = 'err_project'
): Promise<Map<string, DisclosurePolicy>> {
  const map = new Map<string, DisclosurePolicy>()
  if (orgIds.length === 0) return map

  const { data, error } = await supabase
    .from('disclosure_policies')
    .select(
      'id, organization_id, resource_type, advertise_existence, disclose_content, stage_filter'
    )
    .in('organization_id', orgIds)
    .eq('resource_type', resourceType)

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message ?? '')) {
      return map
    }
    console.error('getDisclosurePoliciesForOrgs', error)
    return map
  }

  for (const row of data ?? []) {
    map.set(row.organization_id, row as DisclosurePolicy)
  }
  return map
}

export async function getAccessGrantSet(
  supabase: SupabaseClient,
  requestingOrgId: string,
  resourceType: DisclosureResourceType = 'err_project'
): Promise<Set<string>> {
  const granted = new Set<string>()
  const { data, error } = await supabase
    .from('access_grants')
    .select('resource_id')
    .eq('requesting_organization_id', requestingOrgId)
    .eq('resource_type', resourceType)

  if (error) {
    if (error.code === '42P01' || /does not exist/i.test(error.message ?? '')) {
      return granted
    }
    console.error('getAccessGrantSet', error)
    return granted
  }

  for (const row of data ?? []) {
    if (row.resource_id) granted.add(String(row.resource_id))
  }
  return granted
}

export async function listOversightProjectsForCoordinator(
  supabase: SupabaseClient,
  viewerOrgId: string
): Promise<{ rows: OversightProjectRow[]; unavailable: boolean }> {
  const { data: processorOrgs, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, org_type')
    .eq('org_type', 'processor')
    .eq('is_active', true)

  if (orgError) {
    if (orgError.code === '42P01' || /does not exist/i.test(orgError.message ?? '')) {
      return { rows: [], unavailable: true }
    }
    console.error('listOversightProjectsForCoordinator orgs', orgError)
    return { rows: [], unavailable: true }
  }

  const orgIds = (processorOrgs ?? []).map((o) => o.id)
  if (orgIds.length === 0) return { rows: [], unavailable: false }

  const orgNameById = new Map((processorOrgs ?? []).map((o) => [o.id, o.name]))
  const policies = await getDisclosurePoliciesForOrgs(supabase, orgIds)
  if (policies.size === 0) {
    // Policies table missing or unseeded — soft empty
    const sample = await supabase.from('disclosure_policies').select('id').limit(1)
    if (sample.error && (sample.error.code === '42P01' || /does not exist/i.test(sample.error.message ?? ''))) {
      return { rows: [], unavailable: true }
    }
  }

  const grants = await getAccessGrantSet(supabase, viewerOrgId)

  const { data: pendingReqs } = await supabase
    .from('access_requests')
    .select('id, resource_id, target_organization_id')
    .eq('requesting_organization_id', viewerOrgId)
    .eq('resource_type', 'err_project')
    .eq('status', 'pending')
    .eq('scope', 'record')

  const pendingByResource = new Map<string, string>()
  for (const r of pendingReqs ?? []) {
    if (r.resource_id) pendingByResource.set(String(r.resource_id), r.id)
  }

  // Fetch candidate projects from processor orgs (committed+ typically via stage_filter)
  const { data: projects, error: projError } = await supabase
    .from('err_projects')
    .select(
      `
      id,
      organization_id,
      state,
      locality,
      funding_status,
      status,
      date,
      project_name,
      grant_serial,
      workplan_number,
      project_objectives,
      estimated_beneficiaries,
      "Sector (Primary)",
      emergency_rooms (err_code)
    `
    )
    .in('organization_id', orgIds)
    .eq('is_draft', false)
    .order('date', { ascending: false })
    .limit(500)

  if (projError) {
    console.error('listOversightProjectsForCoordinator projects', projError)
    return { rows: [], unavailable: false }
  }

  const rows: OversightProjectRow[] = []
  for (const p of projects ?? []) {
    const orgId = p.organization_id
    if (!orgId) continue
    const policy = policies.get(orgId) ?? null
    const hasGrant = grants.has(p.id)
    const visibility = canLccSeeProjectContent({
      project: p,
      viewerOrgId,
      policy,
      hasAccessGrant: hasGrant,
    })
    if (visibility === 'hidden') continue

    const owningName = orgNameById.get(orgId) ?? 'Unknown org'
    const stubOrFull =
      visibility === 'disclosed'
        ? toDisclosedSummary(p as Parameters<typeof toDisclosedSummary>[0], owningName)
        : toExistenceStub(p as Parameters<typeof toExistenceStub>[0], owningName)

    rows.push({
      visibility,
      project: stubOrFull,
      pending_request_id: pendingByResource.get(p.id) ?? null,
      has_access_grant: hasGrant,
    })
  }

  return { rows, unavailable: false }
}

export async function emitAccessRequestAudit(args: {
  action: 'access_request.created' | 'access_request.decided'
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
