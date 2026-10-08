import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  applyOrganizationIdFilter,
  getUserOrgScope,
  organizationIdMatchesScope,
  orgScopeBlocksAllData,
} from '@/lib/canvas/orgScope'
import {
  assertProjectInRoomAccess,
  getUserRoomAccess,
} from '@/lib/userRoomAccess'

export type UserGrantAccess =
  | {
      mode: 'all'
      opsPartnerId: null
      grantGridIds: null
      grantIds: null
    }
  | {
      mode: 'partner'
      opsPartnerId: string
      grantGridIds: string[]
      grantIds: string[]
    }
  | {
      mode: 'none'
      opsPartnerId: string | null
      grantGridIds: []
      grantIds: []
    }

/** PostgREST `.in()` with large UUID lists can exceed URL limits. */
export const GRANT_SCOPE_IN_BATCH = 80

export function chunkGrantScopeIds<T extends string | number>(ids: T[]): T[][] {
  if (!ids.length) return []
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += GRANT_SCOPE_IN_BATCH) {
    out.push(ids.slice(i, i + GRANT_SCOPE_IN_BATCH))
  }
  return out
}

const ALL_ACCESS: UserGrantAccess = {
  mode: 'all',
  opsPartnerId: null,
  grantGridIds: null,
  grantIds: null,
}

function noneAccess(opsPartnerId: string | null): UserGrantAccess {
  return {
    mode: 'none',
    opsPartnerId,
    grantGridIds: [],
    grantIds: [],
  }
}

/**
 * Resolve grants linked to an ops_partner via grant_ops_partners (many-to-many).
 */
async function fetchGrantsForOpsPartner(
  opsPartnerId: string
): Promise<{ grantGridIds: string[]; grantIds: string[] }> {
  const supabase = getSupabaseRouteClient()
  const grantGridIds: string[] = []
  const pageSize = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('grant_ops_partners')
      .select('grant_grid_id')
      .eq('ops_partner_id', opsPartnerId)
      .range(from, from + pageSize - 1)

    if (error) {
      console.error('Error fetching grant_ops_partners for partner scope:', error)
      return { grantGridIds: [], grantIds: [] }
    }

    if (!data?.length) break

    for (const row of data) {
      if (row.grant_grid_id) grantGridIds.push(String(row.grant_grid_id))
    }

    if (data.length < pageSize) break
    from += pageSize
  }

  if (grantGridIds.length === 0) {
    return { grantGridIds: [], grantIds: [] }
  }

  const grantIds: string[] = []
  for (const batch of chunkGrantScopeIds(grantGridIds)) {
    const { data: grantRows, error: grantErr } = await supabase
      .from('grants_grid_view')
      .select('id, grant_id')
      .in('id', batch)

    if (grantErr) {
      console.error('Error fetching grants_grid_view for partner scope:', grantErr)
      continue
    }

    for (const row of grantRows || []) {
      if (row.grant_id != null && String(row.grant_id).trim() !== '') {
        grantIds.push(String(row.grant_id).trim())
      }
    }
  }

  return { grantGridIds, grantIds }
}

/**
 * Grant-based data scope for the current session user.
 *
 * Non-partner roles: mode 'all' (no grant filter from this helper).
 * Partner roles always fail closed: never return mode 'all'.
 * Partner scope: users.ops_partner_id → grant_ops_partners (not partners.partner_id).
 */
export async function getUserGrantAccess(): Promise<UserGrantAccess> {
  const supabase = getSupabaseRouteClient()

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()

  if (sessionError || !session) {
    // No session: fail closed for grant scope (callers for non-auth routes should not rely on 'all')
    return noneAccess(null)
  }

  const { data: userData, error } = await supabase
    .from('users')
    .select('role, ops_partner_id')
    .eq('auth_user_id', session.user.id)
    .single()

  if (error || !userData) {
    return noneAccess(null)
  }

  const role = userData.role ?? null
  const opsPartnerId =
    userData.ops_partner_id != null && String(userData.ops_partner_id).trim() !== ''
      ? String(userData.ops_partner_id)
      : null

  // Base ERR must never receive global grant scope (mode 'all').
  // Room scope is enforced via getUserRoomAccess / assertProjectInRoomAccess.
  if (role === 'base_err') {
    return noneAccess(null)
  }

  // Partner must never fall through to mode 'all'
  if (role === 'partner') {
    if (!opsPartnerId) {
      return noneAccess(null)
    }

    let { grantGridIds, grantIds } = await fetchGrantsForOpsPartner(opsPartnerId)
    if (grantGridIds.length === 0) {
      return noneAccess(opsPartnerId)
    }

    // Outer ring: only grants owned by the session organization
    const orgScope = await getUserOrgScope(supabase)
    if (orgScope.mode === 'none') {
      return noneAccess(opsPartnerId)
    }
    if (orgScope.mode === 'org') {
      const filtered = await filterGrantGridIdsByOrganization(
        grantGridIds,
        orgScope.organizationId
      )
      grantGridIds = filtered.grantGridIds
      grantIds = filtered.grantIds
      if (grantGridIds.length === 0) {
        return noneAccess(opsPartnerId)
      }
    }

    return {
      mode: 'partner',
      opsPartnerId,
      grantGridIds,
      grantIds,
    }
  }

  return ALL_ACCESS
}

async function filterGrantGridIdsByOrganization(
  grantGridIds: string[],
  organizationId: string
): Promise<{ grantGridIds: string[]; grantIds: string[] }> {
  const supabase = getSupabaseRouteClient()
  const outGrid: string[] = []
  const outGrantIds: string[] = []
  for (const batch of chunkGrantScopeIds(grantGridIds)) {
    const { data, error } = await supabase
      .from('grants_grid_view')
      .select('id, grant_id')
      .in('id', batch)
      .eq('organization_id', organizationId)
    if (error) {
      console.error('[filterGrantGridIdsByOrganization]', error)
      return { grantGridIds: [], grantIds: [] }
    }
    for (const row of data || []) {
      if (row.id) outGrid.push(String(row.id))
      if (row.grant_id != null && String(row.grant_id).trim() !== '') {
        outGrantIds.push(String(row.grant_id).trim())
      }
    }
  }
  return { grantGridIds: outGrid, grantIds: outGrantIds }
}

/**
 * Whether a grant_grid_id is within the given access result.
 * - mode 'all': no grant restriction (always true)
 * - mode 'none': always false
 * - mode 'partner': true only if grantGridId is in the partner's grant set
 */
export function grantGridIdInAccess(
  access: UserGrantAccess,
  grantGridId: string | null | undefined
): boolean {
  if (access.mode === 'all') return true
  if (access.mode === 'none') return false
  if (grantGridId == null || String(grantGridId).trim() === '') return false
  return access.grantGridIds.includes(String(grantGridId))
}

/**
 * Apply `.in('grant_grid_id', …)` for partner mode.
 * Caller must handle mode 'none' (empty result) before querying.
 * mode 'all': returns query unchanged.
 */
export function applyGrantGridIdFilter<T extends { in: (column: string, values: readonly string[]) => T }>(
  query: T,
  access: UserGrantAccess,
  column: string = 'grant_grid_id'
): T {
  if (access.mode !== 'partner') return query
  return query.in(column, access.grantGridIds)
}

type ProjectScopeRow = {
  id: string
  grant_grid_id: string | null
  organization_id?: string | null
}

async function assertProjectOrganizationScope(
  projectId: string,
  notFoundMessage: string,
  status: 403 | 404
): Promise<
  | { ok: true; organization_id: string | null }
  | { ok: false; response: NextResponse }
> {
  const orgScope = await getUserOrgScope()
  if (orgScopeBlocksAllData(orgScope)) {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status }),
    }
  }
  if (orgScope.mode === 'all') {
    return { ok: true, organization_id: null }
  }
  if (projectId.startsWith('historical_')) {
    // Historical rows have no organization_id; fail closed when org scope is live
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status }),
    }
  }
  const supabase = getSupabaseRouteClient()
  const { data: row, error } = await supabase
    .from('err_projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) {
    console.error('[assertProjectOrganizationScope]', error)
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to load project' }, { status: 500 }),
    }
  }
  if (!row || !organizationIdMatchesScope(orgScope, row.organization_id)) {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status }),
    }
  }
  return { ok: true, organization_id: row.organization_id ?? null }
}

/**
 * Load grant_grid_id for a portal project and assert Partner scope.
 * Historical IDs (`historical_*`) are out of Partner scope.
 * Uses 404 to match existing overview/project convention (no existence leak).
 * Also enforces canvas organization_id scope (Phase 2).
 */
export async function assertProjectInGrantAccess(
  projectId: string,
  access?: UserGrantAccess,
  options?: { notFoundMessage?: string; forbiddenStatus?: 403 | 404 }
): Promise<
  | { ok: true; access: UserGrantAccess; project: ProjectScopeRow }
  | { ok: false; response: NextResponse }
> {
  const notFoundMessage = options?.notFoundMessage ?? 'Project not found'
  const status = options?.forbiddenStatus ?? 404

  const orgCheck = await assertProjectOrganizationScope(projectId, notFoundMessage, status)
  if (!orgCheck.ok) return orgCheck

  const roomCheck = await assertProjectInRoomAccess(projectId, undefined, {
    notFoundMessage: options?.notFoundMessage,
  })
  if (roomCheck.handled) {
    if (!roomCheck.ok) return { ok: false, response: roomCheck.response }
    const grantAccess = access ?? (await getUserGrantAccess())
    return {
      ok: true,
      access: grantAccess,
      project: {
        id: roomCheck.project.id,
        grant_grid_id: roomCheck.project.grant_grid_id,
        organization_id: orgCheck.organization_id,
      },
    }
  }

  const grantAccess = access ?? (await getUserGrantAccess())

  if (grantAccess.mode === 'all') {
    const supabase = getSupabaseRouteClient()
    if (projectId.startsWith('historical_')) {
      return {
        ok: true,
        access: grantAccess,
        project: { id: projectId, grant_grid_id: null, organization_id: null },
      }
    }
    const { data: project, error } = await supabase
      .from('err_projects')
      .select('id, grant_grid_id, organization_id')
      .eq('id', projectId)
      .maybeSingle()
    if (error) {
      console.error('[assertProjectInGrantAccess]', error)
      return {
        ok: false,
        response: NextResponse.json({ error: 'Failed to load project' }, { status: 500 }),
      }
    }
    if (!project) {
      return {
        ok: false,
        response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
      }
    }
    return {
      ok: true,
      access: grantAccess,
      project: {
        id: String(project.id),
        grant_grid_id: project.grant_grid_id ?? null,
        organization_id: project.organization_id ?? null,
      },
    }
  }

  // Partner / none: historical import rows are never in grant scope
  if (projectId.startsWith('historical_')) {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status }),
    }
  }

  if (grantAccess.mode === 'none') {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status }),
    }
  }

  const supabase = getSupabaseRouteClient()
  const { data: project, error } = await supabase
    .from('err_projects')
    .select('id, grant_grid_id, organization_id')
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    console.error('[assertProjectInGrantAccess]', error)
    return {
      ok: false,
      response: NextResponse.json({ error: 'Failed to load project' }, { status: 500 }),
    }
  }

  if (!project || !grantGridIdInAccess(grantAccess, project.grant_grid_id)) {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status }),
    }
  }

  return {
    ok: true,
    access: grantAccess,
    project: {
      id: String(project.id),
      grant_grid_id: project.grant_grid_id ?? null,
      organization_id: project.organization_id ?? null,
    },
  }
}

/**
 * Assert every project id is in Partner grant scope (or mode 'all').
 * Missing / out-of-scope ids → 404.
 */
export async function assertProjectsInGrantAccess(
  projectIds: string[],
  access?: UserGrantAccess,
  options?: { notFoundMessage?: string }
): Promise<
  | { ok: true; access: UserGrantAccess }
  | { ok: false; response: NextResponse }
> {
  const roomAccess = await getUserRoomAccess()
  if (roomAccess.applies) {
    if (roomAccess.mode === 'none') {
      return {
        ok: false,
        response: NextResponse.json(
          { error: options?.notFoundMessage ?? 'Project not found' },
          { status: 404 }
        ),
      }
    }
    for (const id of projectIds.filter(Boolean)) {
      const check = await assertProjectInRoomAccess(id, roomAccess, options)
      if (check.handled && !check.ok) {
        return { ok: false, response: check.response }
      }
    }
    return { ok: true, access: access ?? (await getUserGrantAccess()) }
  }

  const grantAccess = access ?? (await getUserGrantAccess())
  const notFoundMessage = options?.notFoundMessage ?? 'Project not found'
  const unique = Array.from(new Set(projectIds.filter(Boolean)))

  if (unique.length === 0) {
    return { ok: true, access: grantAccess }
  }

  if (grantAccess.mode === 'all') {
    return { ok: true, access: grantAccess }
  }

  if (grantAccess.mode === 'none') {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
    }
  }

  for (const id of unique) {
    if (id.startsWith('historical_')) {
      return {
        ok: false,
        response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
      }
    }
  }

  const supabase = getSupabaseRouteClient()
  const found = new Map<string, string | null>()
  for (const batch of chunkGrantScopeIds(unique)) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('id, grant_grid_id')
      .in('id', batch)
    if (error) {
      console.error('[assertProjectsInGrantAccess]', error)
      return {
        ok: false,
        response: NextResponse.json({ error: 'Failed to load projects' }, { status: 500 }),
      }
    }
    for (const row of data || []) {
      found.set(String(row.id), row.grant_grid_id ?? null)
    }
  }

  for (const id of unique) {
    const gridId = found.get(id)
    if (gridId === undefined || !grantGridIdInAccess(grantAccess, gridId)) {
      return {
        ok: false,
        response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
      }
    }
  }

  return { ok: true, access: grantAccess }
}

/**
 * Fetch portal project ids whose grant_grid_id is in the Partner set.
 * mode 'all' → null (no grant restriction).
 * mode 'none' / empty partner grants → [].
 */
export async function fetchProjectIdsInGrantAccess(
  access: UserGrantAccess,
  options?: { extraFilter?: (q: any) => any }
): Promise<string[] | null> {
  const orgScope = await getUserOrgScope()
  if (orgScopeBlocksAllData(orgScope)) return []

  if (access.mode === 'all') {
    // Still org-bound when canvas is live: return null only when no org filter
    if (orgScope.mode !== 'org') return null
    const supabase = getSupabaseRouteClient()
    const ids: string[] = []
    const pageSize = 1000
    let from = 0
    while (true) {
      let q: any = supabase
        .from('err_projects')
        .select('id')
        .eq('organization_id', orgScope.organizationId)
        .range(from, from + pageSize - 1)
      if (options?.extraFilter) q = options.extraFilter(q)
      const { data, error } = await q
      if (error) {
        console.error('[fetchProjectIdsInGrantAccess]', error)
        throw error
      }
      if (!data?.length) break
      for (const row of data) {
        if (row.id) ids.push(String(row.id))
      }
      if (data.length < pageSize) break
      from += pageSize
    }
    return ids
  }
  if (access.mode === 'none' || access.grantGridIds.length === 0) return []

  const supabase = getSupabaseRouteClient()
  const ids: string[] = []
  for (const batch of chunkGrantScopeIds(access.grantGridIds)) {
    let q: any = supabase.from('err_projects').select('id').in('grant_grid_id', batch)
    q = applyOrganizationIdFilter(q, orgScope)
    if (options?.extraFilter) q = options.extraFilter(q)
    const { data, error } = await q
    if (error) {
      console.error('[fetchProjectIdsInGrantAccess]', error)
      throw error
    }
    for (const row of data || []) {
      if (row.id) ids.push(String(row.id))
    }
  }
  return ids
}

/**
 * MOU is in Partner scope iff at least one linked project has grant_grid_id in the set.
 * Returns in-scope project ids for filtering detail/payment/file responses.
 */
export async function assertMouInGrantAccess(
  mouId: string,
  access?: UserGrantAccess,
  options?: { notFoundMessage?: string }
): Promise<
  | { ok: true; access: UserGrantAccess; inScopeProjectIds: string[] | null }
  | { ok: false; response: NextResponse }
> {
  const roomAccess = await getUserRoomAccess()
  const notFoundMessage = options?.notFoundMessage ?? 'MOU not found'

  if (roomAccess.applies) {
    if (roomAccess.mode === 'none') {
      return {
        ok: false,
        response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
      }
    }
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('err_projects')
      .select('id')
      .eq('mou_id', mouId)
      .eq('emergency_room_id', roomAccess.emergencyRoomId)
    if (error) {
      console.error('[assertMouInGrantAccess] room', error)
      return {
        ok: false,
        response: NextResponse.json({ error: 'Failed to load MOU' }, { status: 500 }),
      }
    }
    const inScopeProjectIds = (data || [])
      .map((r) => (r.id ? String(r.id) : ''))
      .filter(Boolean)
    if (inScopeProjectIds.length === 0) {
      return {
        ok: false,
        response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
      }
    }
    return {
      ok: true,
      access: access ?? (await getUserGrantAccess()),
      inScopeProjectIds,
    }
  }

  const grantAccess = access ?? (await getUserGrantAccess())

  if (grantAccess.mode === 'all') {
    return { ok: true, access: grantAccess, inScopeProjectIds: null }
  }

  if (grantAccess.mode === 'none') {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
    }
  }

  const supabase = getSupabaseRouteClient()
  const inScopeProjectIds: string[] = []

  for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('id')
      .eq('mou_id', mouId)
      .in('grant_grid_id', batch)
    if (error) {
      console.error('[assertMouInGrantAccess]', error)
      return {
        ok: false,
        response: NextResponse.json({ error: 'Failed to load MOU' }, { status: 500 }),
      }
    }
    for (const row of data || []) {
      if (row.id) inScopeProjectIds.push(String(row.id))
    }
  }

  if (inScopeProjectIds.length === 0) {
    return {
      ok: false,
      response: NextResponse.json({ error: notFoundMessage }, { status: 404 }),
    }
  }

  return { ok: true, access: grantAccess, inScopeProjectIds }
}

/**
 * Restrict an err_projects query that is already filtered by mou_id to the
 * projects in assertMouInGrantAccess scope.
 * - inScopeProjectIds === null → mode 'all' (no extra filter)
 * - inScopeProjectIds === [] → impossible match (fail closed)
 * - otherwise → .in('id', inScopeProjectIds)
 */
export function applyMouInScopeProjectFilter<
  T extends {
    in: (column: string, values: readonly string[]) => T
    eq: (column: string, value: string) => T
  },
>(query: T, inScopeProjectIds: string[] | null): T {
  if (inScopeProjectIds == null) return query
  if (inScopeProjectIds.length === 0) {
    // No in-scope projects: force empty result without changing Partner/all semantics elsewhere.
    return query.eq('id', '00000000-0000-0000-0000-000000000000')
  }
  return query.in('id', inScopeProjectIds)
}

/**
 * Whether a project id is within assertMouInGrantAccess in-scope set.
 * null inScopeProjectIds = unrestricted (mode all).
 */
export function isProjectIdInMouScope(
  inScopeProjectIds: string[] | null,
  projectId: string | null | undefined
): boolean {
  if (inScopeProjectIds == null) return true
  if (projectId == null || String(projectId).trim() === '') return false
  return inScopeProjectIds.includes(String(projectId))
}

/**
 * Mou ids that have ≥1 project in Partner grant scope.
 * mode 'all' → null (no filter). mode 'none' → [].
 */
export async function fetchMouIdsInGrantAccess(
  access: UserGrantAccess
): Promise<string[] | null> {
  if (access.mode === 'all') return null
  if (access.mode === 'none' || access.grantGridIds.length === 0) return []

  const supabase = getSupabaseRouteClient()
  const mouIds = new Set<string>()
  for (const batch of chunkGrantScopeIds(access.grantGridIds)) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('mou_id')
      .in('grant_grid_id', batch)
      .not('mou_id', 'is', null)
    if (error) {
      console.error('[fetchMouIdsInGrantAccess]', error)
      throw error
    }
    for (const row of data || []) {
      if (row.mou_id) mouIds.add(String(row.mou_id))
    }
  }
  return Array.from(mouIds)
}
