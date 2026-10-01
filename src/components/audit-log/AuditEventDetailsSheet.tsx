'use client'

import { useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Fingerprint,
  Link2,
  Radar,
  ScrollText,
  Trash2,
} from 'lucide-react'
import { SheetContent, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getPortalRoleLabel } from '@/lib/roleLabels'
import { AuditValuesSection, type AuditDetailLookups } from '@/components/audit-log/AuditDetailValue'
import { AuditTargetDisplay, auditTargetTypeLabel } from '@/components/audit-log/AuditTargetDisplay'
import {
  endpointShowsRawSecondary,
  getAuditEndpointFriendlyLabel,
} from '@/components/audit-log/auditEndpointLabels'
import type { AuditDetailTranslate } from '@/components/audit-log/auditFieldLabels'

export type AuditEventItem = {
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

function parseHttpMethod(endpoint: string | null): string {
  if (!endpoint) return '—'
  const m = endpoint.trim().match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i)
  return m ? m[1].toUpperCase() : 'API'
}

function methodBadgeClass(method: string): string {
  switch (method) {
    case 'DELETE':
      return 'bg-rose-500 text-white'
    case 'PATCH':
    case 'PUT':
      return 'bg-amber-500 text-white'
    case 'POST':
      return 'bg-emerald-600 text-white'
    case 'GET':
      return 'bg-sky-600 text-white'
    default:
      return 'bg-slate-600 text-white'
  }
}

function isDestructiveAction(action: string): boolean {
  return (
    action.includes('deleted') ||
    action.includes('reset') ||
    action.includes('decommitted') ||
    action.includes('removed')
  )
}

function actorInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return parts[0].slice(0, 2).toUpperCase()
}

function roleBadgeClass(role: string | null | undefined): string {
  switch (role) {
    case 'superadmin':
      return 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/50 dark:text-violet-200'
    case 'admin':
      return 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200'
    case 'support':
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200'
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-border dark:bg-muted'
  }
}

function eventShortId(id: string): string {
  return `#EVT-${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

function filteredMetadata(meta: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!meta) return null
  const entries = Object.entries(meta).filter(
    ([k]) => !['source', 'endpoint', 'target_user_id'].includes(k)
  )
  if (entries.length === 0) return null
  return Object.fromEntries(entries)
}

function resolveTargetDisplayId(item: AuditEventItem): string | null {
  if (item.target?.id) return item.target.id
  const projectId = item.metadata?.project_id
  if (projectId != null) return String(projectId)
  return null
}

type Props = {
  item: AuditEventItem
  actionLabel: string
  lookups: AuditDetailLookups
  t: AuditDetailTranslate
  globalIndex: number
  globalTotal: number
  onSelectAdjacent: (direction: -1 | 1) => void
  canSelectPrev: boolean
  canSelectNext: boolean
  onClose: () => void
}

export function AuditEventDetailsSheet({
  item,
  actionLabel,
  lookups,
  t,
  globalIndex,
  globalTotal,
  onSelectAdjacent,
  canSelectPrev,
  canSelectNext,
  onClose,
}: Props) {
  const [snapshotView, setSnapshotView] = useState<'formatted' | 'raw'>('formatted')
  const destructive = isDestructiveAction(item.action)
  const method = parseHttpMethod(item.endpoint)
  const endpointPath =
    item.endpoint?.replace(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i, '').trim() ||
    item.endpoint
  const friendlyEndpoint = getAuditEndpointFriendlyLabel(item.endpoint, t)
  const metaFiltered = useMemo(() => filteredMetadata(item.metadata), [item.metadata])
  const targetDisplayId = resolveTargetDisplayId(item)

  const copyPayload = async () => {
    const payload = {
      id: item.id,
      action: item.action,
      created_at: item.created_at,
      actor: item.actor,
      target: item.target,
      old_values: item.old_values,
      new_values: item.new_values,
      metadata: item.metadata,
      endpoint: item.endpoint,
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    } catch {
      /* ignore */
    }
  }

  const copyEndpoint = async () => {
    if (!item.endpoint) return
    try {
      await navigator.clipboard.writeText(item.endpoint)
    } catch {
      /* ignore */
    }
  }

  const created = new Date(item.created_at)
  const actorName =
    item.actor?.display_name ||
    (item.actor ? t('audit:unknown_user') : t('audit:system_actor'))

  return (
    <SheetContent
      side="right"
      className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div className="border-b border-slate-100 px-5 pb-4 pt-5 dark:border-border/40">
          <div className="flex items-start gap-3 pe-8">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full',
                destructive
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40'
                  : 'bg-slate-100 text-slate-600 dark:bg-muted'
              )}
            >
              {destructive ? (
                <Trash2 className="size-5" />
              ) : (
                <ScrollText className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">
                  {t('audit:details_title', { defaultValue: 'Event details' })}
                </h2>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground dark:border-border">
                  {eventShortId(item.id)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('audit:details_ledger_subtitle', {
                  defaultValue: 'ERR Portal Audit Ledger • Immutable log record',
                })}
              </p>
            </div>
          </div>

          {/* Action banner */}
          <div
            className={cn(
              'mt-4 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5',
              destructive
                ? 'border-rose-100 bg-rose-50/80 dark:border-rose-900/40 dark:bg-rose-950/25'
                : 'border-slate-100 bg-slate-50/80 dark:border-border/40 dark:bg-muted/30'
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  destructive ? 'bg-rose-500' : 'bg-emerald-500'
                )}
              />
              <span className="truncate text-sm font-semibold">{actionLabel}</span>
            </div>
            {destructive && (
              <span className="shrink-0 rounded border border-rose-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                {t('audit:details_destructive_badge', {
                  defaultValue: 'Destructive mutation',
                })}
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Date & source cards */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-100 bg-white p-3 dark:border-border/40 dark:bg-card">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarClock className="size-3.5" />
                {t('audit:details_datetime')}
              </div>
              <p className="mt-1.5 text-sm font-semibold tabular-nums">
                {format(created, 'dd MMM yyyy HH:mm:ss')}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('audit:details_time_ago', {
                  distance: formatDistanceToNow(created, { addSuffix: true }),
                  defaultValue: formatDistanceToNow(created, { addSuffix: true }),
                })}
              </p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-white p-3 dark:border-border/40 dark:bg-card">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Radar className="size-3.5" />
                {t('audit:details_source')}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {item.source === 'system'
                    ? t('audit:source_system')
                    : t('audit:source_user')}
                </span>
                {item.source !== 'system' && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {t('audit:details_session_badge', {
                      defaultValue: 'Authenticated session',
                    })}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('audit:details_console_hint', {
                  defaultValue: 'ERR Portal Web Console',
                })}
              </p>
            </div>
          </div>

          {/* Actor */}
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('audit:details_actor_credentials', {
                defaultValue: 'Actor credentials',
              })}
            </p>
            <div className="mt-2 rounded-lg border border-slate-100 bg-white p-3 dark:border-border/40 dark:bg-card">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
                  {actorInitials(item.actor?.display_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{actorName}</span>
                    {item.actor?.role && (
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                          roleBadgeClass(item.actor.role)
                        )}
                      >
                        {getPortalRoleLabel(item.actor.role, t)}
                      </span>
                    )}
                  </div>
                  {item.actor?.email && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.actor.email}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-50 pt-2 text-[10px] text-muted-foreground dark:border-border/30">
                {item.actor?.id && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Fingerprint className="size-3" />
                    ID: {item.actor.id.slice(0, 8)}…
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Target & endpoint */}
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('audit:details_target_endpoint_section', {
                defaultValue: 'Target & API endpoint',
              })}
            </p>
            <div className="mt-2 rounded-lg border border-slate-100 bg-white p-3 dark:border-border/40 dark:bg-card">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('audit:details_target_resource', {
                  defaultValue: 'Target resource entity',
                })}
              </p>
              <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {auditTargetTypeLabel(item.target?.type, t)}
                  </p>
                  <div className="mt-1 text-sm">
                    <AuditTargetDisplay
                      target={item.target}
                      action={item.action}
                      metadata={item.metadata}
                      lookups={lookups}
                      t={t}
                    />
                  </div>
                </div>
                {targetDisplayId ? (
                  <code className="shrink-0 rounded border border-slate-100 bg-slate-50 px-2 py-1 font-mono text-[10px] text-muted-foreground dark:border-border">
                    id: {targetDisplayId.slice(0, 18)}
                    {targetDisplayId.length > 18 ? '…' : ''}
                  </code>
                ) : null}
              </div>
            </div>

            {item.endpoint && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-slate-100 dark:bg-slate-950">
                <span
                  className={cn(
                    'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
                    methodBadgeClass(method)
                  )}
                >
                  {method}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-teal-300">
                  {endpointPath}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-slate-300 hover:bg-slate-800 hover:text-white"
                  onClick={() => void copyEndpoint()}
                  aria-label={t('audit:copy_endpoint', { defaultValue: 'Copy endpoint' })}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            )}
            {endpointShowsRawSecondary(item.endpoint, friendlyEndpoint) && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                <Link2 className="me-1 inline size-3" />
                {friendlyEndpoint}
              </p>
            )}
          </div>

          {/* Snapshot */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('audit:details_snapshot_title', {
                    defaultValue: 'Audit state snapshot',
                  })}
                </p>
                {destructive && (
                  <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700 dark:border-rose-900 dark:bg-rose-950/40">
                    {t('audit:details_old_purged_hint', {
                      defaultValue: 'Old values',
                    })}
                  </span>
                )}
              </div>
              <div className="flex rounded-md border border-slate-200 p-0.5 text-[10px] dark:border-border">
                <button
                  type="button"
                  className={cn(
                    'rounded px-2.5 py-1 font-medium transition-colors',
                    snapshotView === 'formatted'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSnapshotView('formatted')}
                >
                  {t('audit:details_view_formatted', { defaultValue: 'Formatted' })}
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded px-2.5 py-1 font-medium transition-colors',
                    snapshotView === 'raw'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setSnapshotView('raw')}
                >
                  {t('audit:details_view_raw', { defaultValue: 'Raw JSON' })}
                </button>
              </div>
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              {t('audit:details_snapshot_hint', {
                defaultValue:
                  'Field-level snapshot captured at the time of this event. Sensitive values remain redacted.',
              })}
            </p>

            <div className="mt-3 space-y-4">
              {snapshotView === 'formatted' ? (
                <>
                  <AuditValuesSection
                    title={t('audit:details_old_values')}
                    values={item.old_values}
                    lookups={lookups}
                    t={t}
                  />
                  <AuditValuesSection
                    title={t('audit:details_new_values')}
                    values={item.new_values}
                    lookups={lookups}
                    t={t}
                  />
                  {metaFiltered && (
                    <AuditValuesSection
                      title={t('audit:details_metadata')}
                      values={metaFiltered}
                      lookups={lookups}
                      t={t}
                    />
                  )}
                </>
              ) : (
                <pre className="max-h-[420px] overflow-auto rounded-lg border border-slate-100 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed dark:border-border dark:bg-muted/30">
                  {JSON.stringify(
                    {
                      old_values: item.old_values,
                      new_values: item.new_values,
                      metadata: metaFiltered,
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          </div>

        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 dark:border-border/40 dark:bg-muted/20">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!canSelectPrev}
              onClick={() => onSelectAdjacent(-1)}
              aria-label={t('audit:prev')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('audit:details_event_position', {
                index: globalIndex,
                total: globalTotal,
                defaultValue: `Event ${globalIndex} of ${globalTotal}`,
              })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              disabled={!canSelectNext}
              onClick={() => onSelectAdjacent(1)}
              aria-label={t('audit:next')}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void copyPayload()}
            >
              <Copy className="size-3.5" />
              {t('audit:copy_payload', { defaultValue: 'Copy payload' })}
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={onClose}>
              {t('audit:details_done', { defaultValue: 'Done' })}
            </Button>
          </div>
        </SheetFooter>
      </div>
    </SheetContent>
  )
}
