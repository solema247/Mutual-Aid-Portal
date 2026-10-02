'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { AuditEventDetailsSheet } from '@/components/audit-log/AuditEventDetailsSheet'
import {
  SmartFilter,
  getAuditLogFilterFields,
  type ActiveFilter,
  type FilterSelectOption,
} from '@/components/smart-filter'
import { cn } from '@/lib/utils'
import { getPortalRoleLabel } from '@/lib/roleLabels'
import { AUDIT_ACTION_DEFS, getAuditActionFallback } from '@/lib/auditActionLabels'
import {
  AUDIT_TARGET_TYPE_VALUES,
  auditTargetTypeI18nKey,
  getAuditTargetTypeFallback,
} from '@/lib/auditTargetTypeLabels'
import { AuditTargetDisplay, auditTargetTypeLabel } from '@/components/audit-log/AuditTargetDisplay'
import { auditFieldLabel, summarizeAuditFieldValue } from '@/components/audit-log/auditFieldLabels'
import { getAuditEndpointFriendlyLabel } from '@/components/audit-log/auditEndpointLabels'
import {
  ALL_ACTIVITY_WORKSPACE_ID,
  filterActionsToArea,
  filterTargetTypesToArea,
  getActionsForAuditArea,
  getTargetTypesForAuditArea,
  type AuditArea,
  type AuditAreaTab,
  workspaceIdForArea,
} from '@/lib/auditAreas'
import {
  AuditLogWorkspacesBar,
  type AuditWorkspaceTab,
} from '@/app/err-portal/audit-log/AuditLogWorkspacesBar'
import {
  buildAuditListGeneration,
  getPageFetchCursor,
  mergeNextPageCursor,
  resetStartCursorByPage,
} from '@/lib/auditLogListPagination'

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZES = [25, 50, 100]

type AuditLookups = {
  partners: Record<string, string>
  rooms: Record<string, string>
  states: Record<string, string>
  projects: Record<string, string>
  mous: Record<string, string>
}

type AuditItem = {
  id: string
  created_at: string
  action: string
  actor: {
    id: string
    display_name: string | null
    email: string | null
    role: string | null
  } | null
  target: {
    type: string | null
    id: string | null
    display_name: string | null
    secondary: string | null
    role_key: string | null
  } | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  endpoint: string | null
  source: string | null
}

function getMultiFilterValues(filters: ActiveFilter[], fieldId: string): string[] {
  const f = filters.find((x) => x.fieldId === fieldId)
  if (!f) return []
  if (Array.isArray(f.value)) return f.value.map(String).filter(Boolean)
  if (typeof f.value === 'string' && f.value) return [f.value]
  return []
}

function getDateRange(filters: ActiveFilter[]): { from: string; to: string } {
  const f = filters.find((x) => x.fieldId === 'date_range')
  if (!f || !Array.isArray(f.value)) return { from: '', to: '' }
  return {
    from: String(f.value[0] || ''),
    to: String(f.value[1] || ''),
  }
}

function actionBadgeClass(action: string): string {
  if (action.includes('deleted') || action.includes('reset')) {
    return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
  }
  if (action.includes('created')) {
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  }
  if (action.includes('permission') || action.includes('role')) {
    return 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
  }
  if (action.includes('status') || action.includes('scope')) {
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
  }
  return 'bg-slate-100 text-slate-700 dark:bg-muted dark:text-muted-foreground'
}

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

function summarizeChanges(item: AuditItem, t: TranslateFn): string {
  const parts: string[] = []
  const keys = new Set([
    ...Object.keys(item.old_values ?? {}),
    ...Object.keys(item.new_values ?? {}),
  ])
  for (const key of keys) {
    if (['reason', 'overrides_cleared', 'overrides_count', 'source'].includes(key)) {
      continue
    }
    const next = item.new_values?.[key]
    if (next === undefined) continue
    const label = auditFieldLabel(key, t)
    const display = summarizeAuditFieldValue(next, t)
    parts.push(`${label}: ${display}`)
    if (parts.length >= 2) break
  }
  if (parts.length === 0 && item.endpoint) {
    return getAuditEndpointFriendlyLabel(item.endpoint, t)
  }
  return parts.join(' · ') || t('audit:details_empty', { defaultValue: '—' })
}

export type AuditWorkspace = {
  id: string
  area: AuditArea
  searchInput: string
  search: string
  filters: ActiveFilter[]
  page: number
  pageSize: number
  listGeneration: string
  startCursorByPage: Record<number, string | null>
}

type AuditFilterOptionsRaw = {
  actors: Array<{ value: string; label: string }>
  actions: Array<{ value: string; label: string }>
  targetTypes: Array<{ value: string; label: string }>
}

function auditListGenerationFromWorkspace(
  ws: Pick<AuditWorkspace, 'area' | 'pageSize' | 'search' | 'filters'>
): string {
  const actions = getMultiFilterValues(ws.filters, 'action').slice().sort()
  const targetTypes = getMultiFilterValues(ws.filters, 'target_type').slice().sort()
  const actors = getMultiFilterValues(ws.filters, 'actor').slice().sort()
  const { from, to } = getDateRange(ws.filters)
  return buildAuditListGeneration({
    area: ws.area,
    pageSize: ws.pageSize,
    search: ws.search,
    actions,
    targetTypes,
    actors,
    dateFrom: from,
    dateTo: to,
  })
}

function withPaginationFilterReset(ws: AuditWorkspace, patch: Partial<AuditWorkspace>): AuditWorkspace {
  const next: AuditWorkspace = {
    ...ws,
    ...patch,
    page: 1,
    startCursorByPage: resetStartCursorByPage(),
  }
  next.listGeneration = auditListGenerationFromWorkspace(next)
  return next
}

function createWorkspace(area: AuditArea): AuditWorkspace {
  const base = {
    id: workspaceIdForArea(area),
    area,
    searchInput: '',
    search: '',
    filters: [] as ActiveFilter[],
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  }
  return {
    ...base,
    listGeneration: auditListGenerationFromWorkspace(base),
    startCursorByPage: resetStartCursorByPage(),
  }
}

function sanitizeFiltersForArea(
  filters: ActiveFilter[],
  area: AuditArea
): ActiveFilter[] {
  return filters
    .map((f) => {
      if (f.fieldId === 'action') {
        const vals = getMultiFilterValues([f], 'action')
        const next = filterActionsToArea(area, vals)
        if (vals.length > 0 && next.length === 0) return null
        return { ...f, value: next }
      }
      if (f.fieldId === 'target_type') {
        const vals = getMultiFilterValues([f], 'target_type')
        const next = filterTargetTypesToArea(area, vals)
        if (vals.length > 0 && next.length === 0) return null
        return { ...f, value: next }
      }
      return f
    })
    .filter(Boolean) as ActiveFilter[]
}

/** Stable fetch key — explicit action/target params (not relying on JSON filter shape alone). */
function buildAuditListQueryKey(
  ws: AuditWorkspace,
  refreshNonce: number
): string {
  const actions = getMultiFilterValues(ws.filters, 'action').slice().sort()
  const targetTypes = getMultiFilterValues(ws.filters, 'target_type').slice().sort()
  const actors = getMultiFilterValues(ws.filters, 'actor').slice().sort()
  const { from, to } = getDateRange(ws.filters)
  const cursor = getPageFetchCursor(ws.page, ws.startCursorByPage)
  return JSON.stringify({
    workspaceId: ws.id,
    area: ws.area,
    page: ws.page,
    pageSize: ws.pageSize,
    search: ws.search,
    actions,
    targetTypes,
    actors,
    dateFrom: from,
    dateTo: to,
    listGeneration: ws.listGeneration,
    cursor,
    refreshNonce,
  })
}

export default function AuditLogPage() {
  const { t } = useTranslation(['audit', 'users', 'common', 'err'])

  const [workspaces, setWorkspaces] = useState<AuditWorkspace[]>(() => [
    createWorkspace('all'),
  ])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(ALL_ACTIVITY_WORKSPACE_ID)

  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]

  const updateWorkspace = useCallback(
    (workspaceId: string, patch: Partial<AuditWorkspace>) => {
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, ...patch } : w))
      )
    },
    []
  )

  const patchActive = useCallback(
    (patch: Partial<AuditWorkspace>) => {
      updateWorkspace(activeWorkspaceId, patch)
    },
    [activeWorkspaceId, updateWorkspace]
  )

  const [items, setItems] = useState<AuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [lookups, setLookups] = useState<AuditLookups>({
    partners: {},
    rooms: {},
    states: {},
    projects: {},
    mous: {},
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [selected, setSelected] = useState<AuditItem | null>(null)

  const [filterOptionsRaw, setFilterOptionsRaw] = useState<AuditFilterOptionsRaw | null>(
    null
  )
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null)
  const [workspaceTotals, setWorkspaceTotals] = useState<Record<string, number>>({})
  const [refreshNonce, setRefreshNonce] = useState(0)
  const fetchSeqRef = useRef(0)

  const actorOptions = useMemo((): FilterSelectOption[] => {
    if (!filterOptionsRaw?.actors?.length) return []
    return filterOptionsRaw.actors
  }, [filterOptionsRaw])

  const allActionOptions = useMemo((): FilterSelectOption[] => {
    const source =
      filterOptionsRaw?.actions?.length
        ? filterOptionsRaw.actions
        : AUDIT_ACTION_DEFS.map((d) => ({ value: d.action, label: d.fallback }))
    return source.map((a) => ({
      value: a.value,
      label: t(`audit:action_${a.value.replace(/\./g, '_')}`, {
        defaultValue: a.label,
      }),
    }))
  }, [filterOptionsRaw, t])

  const allTargetTypeOptions = useMemo((): FilterSelectOption[] => {
    const source =
      filterOptionsRaw?.targetTypes?.length
        ? filterOptionsRaw.targetTypes
        : AUDIT_TARGET_TYPE_VALUES.map((value) => ({
            value,
            label: getAuditTargetTypeFallback(value),
          }))
    return source.map((tt) => ({
      value: tt.value,
      label: t(auditTargetTypeI18nKey(tt.value), {
        defaultValue: tt.label || getAuditTargetTypeFallback(tt.value),
      }),
    }))
  }, [filterOptionsRaw, t])

  useEffect(() => {
    const input = activeWorkspace.searchInput
    const wsId = activeWorkspaceId
    const tmr = setTimeout(() => {
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id !== wsId
            ? w
            : withPaginationFilterReset(w, { search: input.trim() })
        )
      )
    }, 300)
    return () => clearTimeout(tmr)
  }, [activeWorkspace.searchInput, activeWorkspaceId])

  const actionOptions = useMemo(() => {
    const allowed = new Set(getActionsForAuditArea(activeWorkspace.area))
    return allActionOptions.filter((o) => allowed.has(o.value))
  }, [allActionOptions, activeWorkspace.area])

  const targetTypeOptions = useMemo(() => {
    const allowed = new Set(getTargetTypesForAuditArea(activeWorkspace.area))
    return allTargetTypeOptions.filter((o) => allowed.has(o.value))
  }, [allTargetTypeOptions, activeWorkspace.area])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setFilterOptionsError(null)
        const res = await fetch('/api/audit-logs/filter-options')
        if (res.status === 401 || res.status === 403) {
          setAccessDenied(true)
          return
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load filter options')
        }
        const data = await res.json()
        if (cancelled) return
        setFilterOptionsRaw({
          actors: Array.isArray(data.actors) ? data.actors : [],
          actions: Array.isArray(data.actions) ? data.actions : [],
          targetTypes: Array.isArray(data.targetTypes) ? data.targetTypes : [],
        })
      } catch (e) {
        if (!cancelled) {
          console.error('Audit log filter-options:', e)
          setFilterOptionsError(
            e instanceof Error ? e.message : 'Failed to load filter options'
          )
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filterFieldLabels = useMemo(
    () => ({
      action: t('audit:filter_action', { defaultValue: 'Action' }),
      actor: t('audit:filter_actor', { defaultValue: 'Actor' }),
      targetType: t('audit:filter_target_type', { defaultValue: 'Target Type' }),
      dateRange: t('audit:filter_date_range', { defaultValue: 'Date Range' }),
    }),
    [t]
  )

  const filterFields = useMemo(
    () =>
      getAuditLogFilterFields({
        actionOptions,
        actorOptions,
        targetTypeOptions,
        labels: filterFieldLabels,
      }),
    [actionOptions, actorOptions, targetTypeOptions, filterFieldLabels]
  )

  const listQueryKey = useMemo(() => {
    const ws = activeWorkspace
    if (!ws) return ''
    return buildAuditListQueryKey(ws, refreshNonce)
  }, [activeWorkspace, refreshNonce])

  useEffect(() => {
    if (!listQueryKey) return

    type ParsedListQuery = {
      workspaceId: string
      area: AuditArea
      page: number
      pageSize: number
      search: string
      actions: string[]
      targetTypes: string[]
      actors: string[]
      dateFrom: string
      dateTo: string
      listGeneration: string
      cursor: string | null
    }

    let parsed: ParsedListQuery
    try {
      parsed = JSON.parse(listQueryKey) as ParsedListQuery
    } catch {
      return
    }

    const seq = ++fetchSeqRef.current

    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        params.set('page', String(parsed.page))
        params.set('pageSize', String(parsed.pageSize))
        if (parsed.search) params.set('search', parsed.search)
        if (parsed.area !== 'all') params.set('area', parsed.area)

        const actions = parsed.actions ?? []
        const actors = parsed.actors ?? []
        const targetTypes = parsed.targetTypes ?? []
        const from = parsed.dateFrom ?? ''
        const to = parsed.dateTo ?? ''

        if (actions.length) params.set('actions', actions.join(','))
        if (actors.length) params.set('actorUserIds', actors.join(','))
        if (targetTypes.length) params.set('targetTypes', targetTypes.join(','))
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        if (parsed.cursor) params.set('cursor', parsed.cursor)

        const res = await fetch(`/api/audit-logs?${params.toString()}`)
        if (seq !== fetchSeqRef.current) return

        if (res.status === 403 || res.status === 401) {
          setAccessDenied(true)
          return
        }
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to load audit logs')
        }
        const data = await res.json()
        if (seq !== fetchSeqRef.current) return

        const nextTotal = typeof data.total === 'number' ? data.total : 0
        setItems(Array.isArray(data.items) ? data.items : [])
        setTotal(nextTotal)
        setWorkspaceTotals((prev) => ({ ...prev, [parsed.workspaceId]: nextTotal }))
        setWorkspaces((prev) =>
          prev.map((w) =>
            w.id !== parsed.workspaceId
              ? w
              : {
                  ...w,
                  startCursorByPage: mergeNextPageCursor(
                    w.startCursorByPage,
                    parsed.page,
                    typeof data.nextCursor === 'string' ? data.nextCursor : null
                  ),
                }
          )
        )
        setLookups({
          partners: data.lookups?.partners ?? {},
          rooms: data.lookups?.rooms ?? {},
          states: data.lookups?.states ?? {},
          projects: data.lookups?.projects ?? {},
          mous: data.lookups?.mous ?? {},
        })
      } catch (e) {
        if (seq !== fetchSeqRef.current) return
        console.error('Audit log list fetch:', e)
        setError(e instanceof Error ? e.message : 'Failed to load audit logs')
      } finally {
        if (seq === fetchSeqRef.current) {
          setLoading(false)
        }
      }
    })()
  }, [listQueryKey])

  const handleFiltersChange = useCallback(
    (next: ActiveFilter[]) => {
      setWorkspaces((prev) =>
        prev.map((w) =>
          w.id !== activeWorkspaceId
            ? w
            : withPaginationFilterReset(w, {
                filters: sanitizeFiltersForArea(next, w.area),
              })
        )
      )
    },
    [activeWorkspaceId]
  )

  const actionLabel = useCallback(
    (action: string) => {
      const def = AUDIT_ACTION_DEFS.find((d) => d.action === action)
      if (def) {
        return t(def.i18nKey, { defaultValue: def.fallback })
      }
      return getAuditActionFallback(action)
    },
    [t]
  )

  const page = activeWorkspace.page
  const pageSize = activeWorkspace.pageSize
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1
  const showingTo = Math.min(page * pageSize, total)

  const selectedListIndex = selected
    ? items.findIndex((i) => i.id === selected.id)
    : -1
  const selectedGlobalIndex =
    selectedListIndex >= 0 ? (page - 1) * pageSize + selectedListIndex + 1 : 0

  const workspaceTabs: AuditWorkspaceTab[] = workspaces.map((w) => ({
    id: w.id,
    area: w.area,
    resultTotal: w.id === activeWorkspaceId ? total : workspaceTotals[w.id],
  }))

  const openAreaWorkspace = (area: AuditAreaTab) => {
    const id = workspaceIdForArea(area)
    setWorkspaces((prev) => {
      if (prev.some((w) => w.id === id)) return prev
      return [...prev, createWorkspace(area)]
    })
    setActiveWorkspaceId(id)
  }

  const closeWorkspace = (workspaceId: string) => {
    if (workspaceId === ALL_ACTIVITY_WORKSPACE_ID) return
    setWorkspaces((prev) => {
      const idx = prev.findIndex((w) => w.id === workspaceId)
      const next = prev.filter((w) => w.id !== workspaceId)
      const withAll = next.some((w) => w.id === ALL_ACTIVITY_WORKSPACE_ID)
        ? next
        : [createWorkspace('all'), ...next]
      if (activeWorkspaceId === workspaceId) {
        const fallback = withAll[idx - 1] ?? withAll[0]
        setActiveWorkspaceId(fallback?.id ?? ALL_ACTIVITY_WORKSPACE_ID)
      }
      return withAll
    })
  }

  const clearFilters = () => {
    setWorkspaces((prev) =>
      prev.map((w) =>
        w.id !== activeWorkspaceId
          ? w
          : withPaginationFilterReset(w, {
              filters: [],
              searchInput: '',
              search: '',
            })
      )
    )
  }

  const smartFilterKey = `${activeWorkspaceId}-${activeWorkspace.area}`
  const urlParamPrefix =
    activeWorkspaceId === ALL_ACTIVITY_WORKSPACE_ID
      ? 'al_'
      : `al_${activeWorkspace.area}_`

  if (accessDenied) {
    notFound()
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden p-1 sm:p-0">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {t('audit:title', { defaultValue: 'Audit Log' })}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t('audit:subtitle', {
            defaultValue:
              'A chronological record of important user and permission changes in the portal.',
          })}
        </p>
      </div>

      <AuditLogWorkspacesBar
        t={t}
        activeWorkspaceId={activeWorkspaceId}
        workspaces={workspaceTabs}
        onActivate={setActiveWorkspaceId}
        onCloseWorkspace={closeWorkspace}
        onOpenArea={openAreaWorkspace}
      />

      <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm dark:border-border/40 dark:bg-card">
        <div className="flex flex-row flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-border/40">
          <div className="relative w-full max-w-xs shrink-0 sm:w-64">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={activeWorkspace.searchInput}
              onChange={(e) =>
                patchActive({ searchInput: e.target.value })
              }
              placeholder={t('audit:search_placeholder', {
                defaultValue: 'Search actor, target, action, or endpoint…',
              })}
              className="h-8 rounded-md border-slate-200 bg-background ps-8 text-sm"
            />
          </div>
          <SmartFilter
            key={smartFilterKey}
            fields={filterFields}
            filters={activeWorkspace.filters}
            onFiltersChange={handleFiltersChange}
            urlParamPrefix={urlParamPrefix}
            layout="inline"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 rounded-md text-xs"
            onClick={clearFilters}
          >
            {t('audit:clear_filters', { defaultValue: 'Clear filters' })}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-md p-0"
            onClick={() => setRefreshNonce((n) => n + 1)}
            disabled={loading}
            aria-label={t('common:refresh', { defaultValue: 'Refresh' })}
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {(error || filterOptionsError) && (
          <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            {error || filterOptionsError}
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[150px_minmax(160px,1.2fr)_140px_minmax(160px,1.2fr)_minmax(180px,1.4fr)] items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:border-border/40 dark:bg-muted/15">
              <div>{t('audit:col_datetime')}</div>
              <div>{t('audit:col_actor')}</div>
              <div>{t('audit:col_action')}</div>
              <div>{t('audit:col_target')}</div>
              <div>{t('audit:col_details')}</div>
            </div>

            {loading && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('audit:loading')}
              </div>
            ) : items.length === 0 ? (
              <div className="space-y-1 px-4 py-10 text-center">
                <p className="text-sm font-medium">{t('audit:no_results')}</p>
                <p className="text-xs text-muted-foreground">{t('audit:no_results_hint')}</p>
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="grid w-full grid-cols-[150px_minmax(160px,1.2fr)_140px_minmax(160px,1.2fr)_minmax(180px,1.4fr)] items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-start transition-colors hover:bg-slate-50/80 dark:border-border/20 dark:hover:bg-muted/20"
                >
                  <div className="text-xs tabular-nums text-muted-foreground">
                    {format(new Date(item.created_at), 'dd MMM yyyy HH:mm')}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.actor?.display_name ||
                        (item.actor
                          ? t('audit:unknown_user')
                          : t('audit:system_actor'))}
                    </div>
                    {item.actor?.email && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {item.actor.email}
                      </div>
                    )}
                  </div>
                  <div>
                    <span
                      className={cn(
                        'inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold',
                        actionBadgeClass(item.action)
                      )}
                    >
                      {actionLabel(item.action)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <AuditTargetDisplay
                      target={item.target}
                      action={item.action}
                      metadata={item.metadata}
                      lookups={lookups}
                      t={t}
                    />
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {summarizeChanges(item, t)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Mobile cards */}
        <div className="space-y-2 p-3 md:hidden">
          {loading && items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('audit:loading')}</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('audit:no_results')}</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="w-full rounded-md border border-slate-100 bg-slate-50/40 p-3 text-start dark:border-border/40 dark:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      'inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold',
                      actionBadgeClass(item.action)
                    )}
                  >
                    {actionLabel(item.action)}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {format(new Date(item.created_at), 'dd MMM HH:mm')}
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium">
                  {item.actor?.display_name || t('audit:system_actor')}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {item.target?.display_name ||
                    (item.target?.type === 'role' && item.target.role_key
                      ? getPortalRoleLabel(item.target.role_key, t)
                      : auditTargetTypeLabel(item.target?.type, t))}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-border/40">
          <p className="text-xs text-muted-foreground">
            {t('audit:showing', {
              from: showingFrom,
              to: showingTo,
              total,
              defaultValue: `Showing ${showingFrom}–${showingTo} of ${total}`,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t('audit:rows_per_page')}</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  const pageSize = Number(v)
                  setWorkspaces((prev) =>
                    prev.map((w) =>
                      w.id !== activeWorkspaceId
                        ? w
                        : withPaginationFilterReset(w, { pageSize })
                    )
                  )
                }}
              >
                <SelectTrigger className="h-7 w-[72px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page <= 1 || loading}
              onClick={() => patchActive({ page: Math.max(1, page - 1) })}
            >
              <ChevronLeft className="size-3.5" />
              <span className="sr-only sm:not-sr-only sm:ms-1">{t('audit:prev')}</span>
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={page >= totalPages || loading}
              onClick={() => patchActive({ page: Math.min(totalPages, page + 1) })}
            >
              <span className="sr-only sm:not-sr-only sm:me-1">{t('audit:next')}</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        {selected && (
          <AuditEventDetailsSheet
            item={selected}
            actionLabel={actionLabel(selected.action)}
            lookups={lookups}
            t={t}
            globalIndex={selectedGlobalIndex}
            globalTotal={total}
            canSelectPrev={selectedListIndex > 0}
            canSelectNext={
              selectedListIndex >= 0 && selectedListIndex < items.length - 1
            }
            onSelectAdjacent={(direction) => {
              const idx = items.findIndex((i) => i.id === selected.id)
              const next = items[idx + direction]
              if (next) setSelected(next)
            }}
            onClose={() => setSelected(null)}
          />
        )}
      </Sheet>
    </div>
  )
}
