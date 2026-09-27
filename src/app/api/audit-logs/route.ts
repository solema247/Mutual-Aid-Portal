import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  createAuthEmailAdminMetrics,
  findAuthUserIdsByEmailSearch,
  getEmailsByAuthUserIds,
} from '@/app/api/users/utils/authEmails'
import { requireAuditLogViewer } from '@/lib/requireAuditLogViewer'
import { sanitizeAuditRecord } from '@/lib/auditLog'
import { KNOWN_AUDIT_ACTIONS } from '@/lib/auditActionLabels'
import {
  collectEnrichmentIds,
  fetchEnrichmentLookups,
  resolveAuditTargetDisplay,
} from '@/lib/auditLogListEnrichment'
import { isKnownAuditTargetType } from '@/lib/auditTargetTypeLabels'
import {
  isAuditArea,
  resolveEffectiveAuditActions,
  type AuditArea,
} from '@/lib/auditAreas'
import {
  auditSearchPreQueryPlan,
  buildAuditLogSearchOrParts,
  isAuditSearchUuid,
  parseAuditSearchTerm,
} from '@/lib/auditLogSearch'
import { resolveAuditLogListTotalNeed } from '@/lib/auditLogCount'
import {
  buildKeysetCursorOrFilter,
  decodeAuditLogCursor,
  encodeAuditLogCursor,
  resolveAuditLogPaginationMode,
} from '@/lib/auditLogCursor'
import { AuditLogRoutePerf } from '@/lib/auditLogRoutePerf'

const PAGE_SIZES = [25, 50, 100] as const

function parseCsv(param: string | null): string[] {
  if (!param) return []
  return param
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 1) return fallback
  return Math.floor(n)
}

function isUuid(value: string): boolean {
  return isAuditSearchUuid(value)
}

/** Shared filter path for row fetch and exact count (single PostgREST request). */
function applyAuditLogListFilters<Q>(
  query: Q,
  args: {
    area: AuditArea | null
    actions: string[]
    actorUserIds: string[]
    targetTypes: string[]
    from: string | null
    to: string | null
    searchOrParts: string[] | null
  }
): Q | 'empty_action_intersection' {
  // Supabase query builder is mutated via chained methods; keep a loose reference for typing.
  let q = query as {
    in: (col: string, vals: string[]) => typeof q
    gte: (col: string, val: string) => typeof q
    lte: (col: string, val: string) => typeof q
    or: (expr: string) => typeof q
  }
  if (args.area) {
    const effectiveActions = resolveEffectiveAuditActions(args.area, args.actions)
    if (args.actions.length > 0 && effectiveActions.length === 0) {
      return 'empty_action_intersection'
    }
    if (effectiveActions.length > 0) {
      q = q.in('action', effectiveActions)
    }
  } else if (args.actions.length > 0) {
    q = q.in('action', args.actions)
  }
  if (args.actorUserIds.length > 0) {
    q = q.in('actor_user_id', args.actorUserIds)
  }
  if (args.targetTypes.length > 0) {
    q = q.in('target_type', args.targetTypes)
  }
  if (args.from) {
    const fromIso = args.from.length <= 10 ? `${args.from}T00:00:00.000Z` : args.from
    q = q.gte('created_at', fromIso)
  }
  if (args.to) {
    const toIso = args.to.length <= 10 ? `${args.to}T23:59:59.999Z` : args.to
    q = q.lte('created_at', toIso)
  }
  if (args.searchOrParts && args.searchOrParts.length > 0) {
    q = q.or(args.searchOrParts.join(','))
  }
  return q as Q
}

function applyAuditLogKeysetCursor<Q>(query: Q, cursor: { t: string; i: string }): Q {
  let q = query as { or: (expr: string) => typeof q }
  q = q.or(buildKeysetCursorOrFilter(cursor.t, cursor.i))
  return q as Q
}

type AuditLogListFilterArgs = {
  area: AuditArea | null
  actions: string[]
  actorUserIds: string[]
  targetTypes: string[]
  from: string | null
  to: string | null
  searchOrParts: string[] | null
}

async function fetchExactAuditLogCount(
  admin: ReturnType<typeof getSupabaseAdmin>,
  filterArgs: AuditLogListFilterArgs
): Promise<number> {
  const countQuery = admin.from('audit_logs').select('id', { count: 'exact', head: true })
  const filtered = applyAuditLogListFilters(countQuery, filterArgs)
  if (filtered === 'empty_action_intersection') return 0
  const { count, error } = await filtered
  if (error) {
    console.error('GET /api/audit-logs count:', error)
    throw error
  }
  return count ?? 0
}

function collectUuidsFromJson(
  value: unknown,
  into: Set<string>,
  keysOfInterest: Set<string>
): void {
  if (value == null) return
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string' && isUuid(item)) into.add(item)
      else collectUuidsFromJson(item, into, keysOfInterest)
    }
    return
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keysOfInterest.has(k)) {
        if (typeof v === 'string' && isUuid(v)) into.add(v)
        if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === 'string' && isUuid(item)) into.add(item)
          }
        }
      }
      collectUuidsFromJson(v, into, keysOfInterest)
    }
  }
}

type UserLite = {
  id: string
  display_name: string | null
  role: string | null
  auth_user_id: string | null
  status: string | null
}

/**
 * GET /api/audit-logs
 * Read-only, paginated audit log listing for support/admin/superadmin.
 */
export async function GET(request: Request) {
  const perf = AuditLogRoutePerf.maybeCreate()
  const authEmailMetrics = perf ? createAuthEmailAdminMetrics() : undefined
  const auth = perf
    ? await perf.timeStage('auth', () => requireAuditLogViewer())
    : await requireAuditLogViewer()
  if (auth instanceof NextResponse) return auth

  const url = new URL(request.url)
  const page = parsePositiveInt(url.searchParams.get('page'), 1)
  const pageSizeRaw = parsePositiveInt(url.searchParams.get('pageSize'), 25)
  const pageSize = PAGE_SIZES.includes(pageSizeRaw as (typeof PAGE_SIZES)[number])
    ? pageSizeRaw
    : 25
  const search = url.searchParams.get('search')?.trim() || ''
  const actions = parseCsv(url.searchParams.get('actions')).filter((a) =>
    KNOWN_AUDIT_ACTIONS.includes(a as (typeof KNOWN_AUDIT_ACTIONS)[number])
  )
  const actorUserIds = parseCsv(url.searchParams.get('actorUserIds')).filter(isUuid)
  const targetTypes = parseCsv(url.searchParams.get('targetTypes')).filter(isKnownAuditTargetType)
  const from = url.searchParams.get('from')?.trim() || null
  const to = url.searchParams.get('to')?.trim() || null
  const areaRaw = url.searchParams.get('area')?.trim() || null
  const area: AuditArea | null =
    areaRaw && isAuditArea(areaRaw) && areaRaw !== 'all' ? areaRaw : null
  const cursorParam = url.searchParams.get('cursor')?.trim() || ''
  const decodedCursor = cursorParam ? decodeAuditLogCursor(cursorParam) : null
  if (cursorParam && !decodedCursor) {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 })
  }

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (e) {
    console.error('GET /api/audit-logs admin client:', e)
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const parsedSearch = perf
    ? perf.timeStageSync('search_parse', () =>
        search ? parseAuditSearchTerm(search) : null
      )
    : search
      ? parseAuditSearchTerm(search)
      : null
  let searchUserIds: string[] = []
  let searchProjectIds: string[] = []
  let searchOrParts: string[] | null = null
  let searchKind: string | null = parsedSearch?.kind ?? null
  /** Reuse Auth emails resolved during email search for list enrichment. */
  const authEmailsFromSearch = new Map<string, string>()

  if (parsedSearch && parsedSearch.escaped) {
    const preQuery = auditSearchPreQueryPlan(parsedSearch.kind, parsedSearch.escaped)

    if (preQuery.usersDisplayName) {
      const nameMatches = perf
        ? await perf.timeDb(
            'prequery.users_display_name',
            'prequery',
            async () =>
              admin
                .from('users')
                .select('id')
                .ilike('display_name', `%${parsedSearch.escaped}%`)
                .limit(200),
            (r) => (r.data ?? []).length
          )
        : await admin
            .from('users')
            .select('id')
            .ilike('display_name', `%${parsedSearch.escaped}%`)
            .limit(200)
      searchUserIds = ((nameMatches.data ?? []) as { id: string }[]).map((r) => r.id)
    }

    if (preQuery.authEmail) {
      const authIds = perf
        ? await perf.timeDb(
            'prequery.auth_email_scan',
            'auth',
            () =>
              findAuthUserIdsByEmailSearch(
                parsedSearch.escaped,
                authEmailsFromSearch,
                authEmailMetrics
              ),
            (ids) => ids.length
          )
        : await findAuthUserIdsByEmailSearch(
            parsedSearch.escaped,
            authEmailsFromSearch,
            authEmailMetrics
          )
      if (authIds.length > 0) {
        const emailUsers = perf
          ? await perf.timeDb(
              'prequery.users_by_auth_id',
              'prequery',
              async () =>
                admin
                  .from('users')
                  .select('id')
                  .in('auth_user_id', authIds.slice(0, 200)),
              (r) => (r.data ?? []).length
            )
          : await admin
              .from('users')
              .select('id')
              .in('auth_user_id', authIds.slice(0, 200))
        for (const u of emailUsers.data ?? []) {
          if (u.id) searchUserIds.push(u.id as string)
        }
        searchUserIds = [...new Set(searchUserIds)]
      }
    }

    if (preQuery.projectGrantId) {
      const pattern = `%${parsedSearch.escaped}%`
      const runGrantPrequeries = async () => {
        const [byGrantId, byGrantSerial] = await Promise.all([
          admin.from('err_projects').select('id').ilike('grant_id', pattern).limit(80),
          admin
            .from('err_projects')
            .select('id')
            .ilike('grant_serial_id', pattern)
            .limit(80),
        ])
        return { byGrantId, byGrantSerial }
      }
      const grantResult = perf
        ? await perf.timeDb(
            'prequery.err_projects_grant',
            'prequery',
            runGrantPrequeries,
            (r) =>
              [...(r.byGrantId.data ?? []), ...(r.byGrantSerial.data ?? [])].length
          )
        : await runGrantPrequeries()
      const idSet = new Set<string>()
      for (const row of [
        ...(grantResult.byGrantId.data ?? []),
        ...(grantResult.byGrantSerial.data ?? []),
      ]) {
        if (row.id) idSet.add(row.id as string)
      }
      searchProjectIds = [...idSet].slice(0, 80)
    }

    searchOrParts = perf
      ? perf.timeStageSync('search_build_or', () =>
          buildAuditLogSearchOrParts({
            trimmed: parsedSearch.trimmed,
            escaped: parsedSearch.escaped,
            kind: parsedSearch.kind,
            searchUserIds,
            searchProjectIds,
          })
        )
      : buildAuditLogSearchOrParts({
          trimmed: parsedSearch.trimmed,
          escaped: parsedSearch.escaped,
          kind: parsedSearch.kind,
          searchUserIds,
          searchProjectIds,
        })
  }

  const filterArgs: AuditLogListFilterArgs = {
    area,
    actions,
    actorUserIds,
    targetTypes,
    from,
    to,
    searchOrParts,
  }

  let rowQuery = admin.from('audit_logs').select(
    'id, created_at, actor_user_id, action, target_type, target_id, old_values, new_values, metadata, ip_address, user_agent'
  )

  const filtered = applyAuditLogListFilters(rowQuery, filterArgs)

  if (filtered === 'empty_action_intersection') {
    if (perf) {
      const snap = perf.finish({
        count_mode: 'skipped_empty',
        meta: {
          area: area ?? 'all',
          page,
          page_size: pageSize,
          has_search: search.length > 0,
          search_kind: searchKind,
          list_rows: 0,
        },
      })
      perf.logSnapshot('empty_action_intersection', snap)
    }
    return NextResponse.json({
      items: [],
      total: 0,
      page,
      pageSize,
      nextCursor: null,
      hasNextPage: false,
      lookups: { partners: {}, rooms: {}, states: {}, projects: {}, mous: {} },
    })
  }

  rowQuery = filtered

  const paginationMode = resolveAuditLogPaginationMode(page, decodedCursor !== null)
  if (decodedCursor) {
    rowQuery = applyAuditLogKeysetCursor(rowQuery, decodedCursor)
  }

  const fromIdx = (page - 1) * pageSize
  const toIdx = fromIdx + pageSize - 1

  let orderedQuery = rowQuery
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (paginationMode === 'keyset' || paginationMode === 'keyset_first_page') {
    orderedQuery = orderedQuery.limit(pageSize)
  } else {
    orderedQuery = orderedQuery.range(fromIdx, toIdx)
  }

  const listResult = perf
    ? await perf.timeDb(
        'audit_logs.list',
        'list',
        async () => orderedQuery,
        (r) => (r.data ?? []).length
      )
    : await orderedQuery
  const { data: rows, error } = listResult

  if (error) {
    console.error('GET /api/audit-logs query:', error)
    return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 })
  }

  const list = rows ?? []

  const lastRow = list.length > 0 ? list[list.length - 1] : null
  const nextCursor =
    list.length >= pageSize && lastRow?.created_at && lastRow?.id
      ? encodeAuditLogCursor(String(lastRow.created_at), String(lastRow.id))
      : null
  const hasNextPage = nextCursor !== null

  const totalNeed = resolveAuditLogListTotalNeed(page, pageSize, list.length)
  let total: number
  let countMode: 'derived' | 'db' = 'derived'
  if (totalNeed.mode === 'derived') {
    total = totalNeed.total
  } else {
    countMode = 'db'
    try {
      total = perf
        ? await perf.timeDb(
            'audit_logs.count',
            'count',
            () => fetchExactAuditLogCount(admin, filterArgs),
            (n) => n
          )
        : await fetchExactAuditLogCount(admin, filterArgs)
    } catch {
      return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 })
    }
  }
  const userIds = new Set<string>()
  const partnerIds = new Set<string>()
  const roomIds = new Set<string>()
  const stateIds = new Set<string>()

  for (const row of list) {
    if (row.actor_user_id) userIds.add(row.actor_user_id)
    if (row.target_type === 'user' && row.target_id) userIds.add(row.target_id)
    collectUuidsFromJson(row.old_values, partnerIds, new Set(['partner_id']))
    collectUuidsFromJson(row.new_values, partnerIds, new Set(['partner_id']))
    collectUuidsFromJson(row.old_values, roomIds, new Set(['err_id']))
    collectUuidsFromJson(row.new_values, roomIds, new Set(['err_id']))
    collectUuidsFromJson(row.old_values, stateIds, new Set(['visible_states']))
    collectUuidsFromJson(row.new_values, stateIds, new Set(['visible_states']))
  }

  const userIdList = [...userIds]
  const usersById = new Map<string, UserLite>()
  if (userIdList.length > 0) {
    const usersResult = perf
      ? await perf.timeDb(
          'enrichment.users',
          'enrichment',
          async () =>
            admin
              .from('users')
              .select('id, display_name, role, auth_user_id, status')
              .in('id', userIdList),
          (r) => (r.data ?? []).length
        )
      : await admin
          .from('users')
          .select('id, display_name, role, auth_user_id, status')
          .in('id', userIdList)
    for (const u of usersResult.data ?? []) {
      usersById.set(u.id, u as UserLite)
    }
  }

  const emailByAuthId = perf
    ? await perf.timeDb(
        'enrichment.auth_emails',
        'enrichment',
        () =>
          getEmailsByAuthUserIds(
            [...usersById.values()].map((u) => u.auth_user_id),
            authEmailsFromSearch,
            authEmailMetrics
          ),
        (m) => m.size
      )
    : await getEmailsByAuthUserIds(
        [...usersById.values()].map((u) => u.auth_user_id),
        authEmailsFromSearch,
        authEmailMetrics
      )

  const partnersById = new Map<string, string>()
  const partnerList = [...partnerIds].filter(isUuid)
  if (partnerList.length > 0) {
    const partnersResult = perf
      ? await perf.timeDb(
          'enrichment.partners',
          'enrichment',
          async () => admin.from('partners').select('id, name').in('id', partnerList),
          (r) => (r.data ?? []).length
        )
      : await admin.from('partners').select('id, name').in('id', partnerList)
    for (const p of partnersResult.data ?? []) {
      if (p.id && p.name) partnersById.set(p.id, p.name)
    }
  }

  const roomsById = new Map<string, string>()
  const roomList = [...roomIds].filter(isUuid)
  if (roomList.length > 0) {
    const roomsResult = perf
      ? await perf.timeDb(
          'enrichment.emergency_rooms',
          'enrichment',
          async () =>
            admin.from('emergency_rooms').select('id, name, err_code').in('id', roomList),
          (r) => (r.data ?? []).length
        )
      : await admin
          .from('emergency_rooms')
          .select('id, name, err_code')
          .in('id', roomList)
    for (const r of roomsResult.data ?? []) {
      if (r.id) {
        const label = [r.err_code, r.name].filter(Boolean).join(' · ') || r.name || r.id
        roomsById.set(r.id, label)
      }
    }
  }

  const statesById = new Map<string, string>()
  const stateList = [...stateIds].filter(isUuid)
  if (stateList.length > 0) {
    const statesResult = perf
      ? await perf.timeDb(
          'enrichment.states',
          'enrichment',
          async () => admin.from('states').select('id, state_name').in('id', stateList),
          (r) => (r.data ?? []).length
        )
      : await admin.from('states').select('id, state_name').in('id', stateList)
    for (const s of statesResult.data ?? []) {
      if (s.id && s.state_name) statesById.set(s.id, s.state_name)
    }
  }

  const enrichIds = collectEnrichmentIds(
    list.map((row) => ({
      target_type: row.target_type,
      target_id: row.target_id,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
      new_values: (row.new_values as Record<string, unknown> | null) ?? null,
    }))
  )
  const enrichLookups = perf
    ? await perf.timeDb(
        'enrichment.projects_mous_payments',
        'enrichment',
        () => fetchEnrichmentLookups(admin, enrichIds),
        (lk) =>
          Object.keys(lk.projects).length +
          Object.keys(lk.mous).length +
          Object.keys(lk.paymentConfirmations).length
      )
    : await fetchEnrichmentLookups(admin, enrichIds)

  const items = list.map((row) => {
    const actor = row.actor_user_id ? usersById.get(row.actor_user_id) : null
    const actorEmail = actor?.auth_user_id
      ? emailByAuthId.get(actor.auth_user_id) ?? null
      : null

    const metaRaw = (row.metadata ?? {}) as Record<string, unknown>
    const nvRaw = (row.new_values ?? {}) as Record<string, unknown>
    const ovRaw = (row.old_values ?? {}) as Record<string, unknown>
    const roleKey =
      (typeof metaRaw.role === 'string' && metaRaw.role) ||
      (typeof nvRaw.role === 'string' && nvRaw.role) ||
      (typeof ovRaw.role === 'string' && ovRaw.role) ||
      null

    let targetUser: {
      display_name: string | null
      role: string | null
      email: string | null
    } | null = null
    if (row.target_type === 'user' && row.target_id) {
      const tu = usersById.get(row.target_id)
      const tEmail = tu?.auth_user_id
        ? emailByAuthId.get(tu.auth_user_id) ?? null
        : null
      targetUser = {
        display_name: tu?.display_name ?? null,
        role: tu?.role ?? null,
        email: tEmail,
      }
    }

    const target = resolveAuditTargetDisplay({
      row: {
        target_type: row.target_type,
        target_id: row.target_id,
        metadata: metaRaw,
      },
      newValues: nvRaw,
      targetUser,
      roleKey,
      lookups: enrichLookups,
    })

    const meta = sanitizeAuditRecord(
      (row.metadata as Record<string, unknown> | null) ?? null
    )
    const oldValues = sanitizeAuditRecord(
      (row.old_values as Record<string, unknown> | null) ?? null
    )
    const newValues = sanitizeAuditRecord(
      (row.new_values as Record<string, unknown> | null) ?? null
    )

    return {
      id: row.id,
      created_at: row.created_at,
      action: row.action,
      actor: actor
        ? {
            id: actor.id,
            display_name: actor.display_name,
            email: actorEmail,
            role: actor.role,
          }
        : row.actor_user_id
          ? { id: row.actor_user_id, display_name: null, email: null, role: null }
          : null,
      target,
      old_values: oldValues,
      new_values: newValues,
      metadata: meta,
      ip_address: row.ip_address ? String(row.ip_address) : null,
      user_agent: row.user_agent,
      endpoint:
        typeof meta?.endpoint === 'string' ? meta.endpoint : null,
      source: typeof meta?.source === 'string' ? meta.source : null,
    }
  })

  if (perf) {
    const snap = perf.finish({
      count_mode: countMode,
      meta: {
        area: area ?? 'all',
        page,
        page_size: pageSize,
        pagination_mode: paginationMode,
        has_search: search.length > 0,
        search_kind: searchKind,
        search_or_branch_count: searchOrParts?.length ?? 0,
        list_rows: list.length,
        total,
        has_next_page: hasNextPage,
        action_filter_count: actions.length,
        actor_filter_count: actorUserIds.length,
        target_type_filter_count: targetTypes.length,
        has_date_from: !!from,
        has_date_to: !!to,
        uses_cursor: decodedCursor !== null,
        auth_emails_seed_size: authEmailsFromSearch.size,
        auth_list_users_calls: authEmailMetrics?.listUsersCalls ?? null,
        auth_list_users_pages: authEmailMetrics?.listUsersPages ?? null,
        auth_get_user_by_id_calls: authEmailMetrics?.getUserByIdCalls ?? null,
        auth_postgrest_attempts: authEmailMetrics?.postgrestAttempts ?? null,
      },
    })
    perf.logSnapshot('ok', snap)
  }

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    nextCursor,
    hasNextPage,
    lookups: {
      partners: Object.fromEntries(partnersById),
      rooms: Object.fromEntries(roomsById),
      states: Object.fromEntries(statesById),
      projects: enrichLookups.projects,
      mous: enrichLookups.mous,
    },
  })
}
