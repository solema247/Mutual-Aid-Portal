'use client'

import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  CreditCard,
  FileBarChart,
  FileSignature,
  FileText,
  FolderKanban,
  LayoutList,
  Shield,
  Users,
  X,
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  ALL_ACTIVITY_WORKSPACE_ID,
  AUDIT_AREA_TAB_IDS,
  type AuditArea,
  type AuditAreaTab,
  auditAreaI18nKey,
  isAuditAreaTab,
} from '@/lib/auditAreas'

export type AuditWorkspaceTab = {
  id: string
  area: AuditArea
  /** Optional count badge from last fetch (current page total). */
  resultTotal?: number
}

type TranslateFn = (key: string, opts?: Record<string, unknown>) => string

const AREA_ICONS: Record<AuditArea, LucideIcon> = {
  all: LayoutList,
  f1: Activity,
  f2: FolderKanban,
  mou: FileSignature,
  payment: CreditCard,
  f4: FileText,
  f5: FileBarChart,
  user_management: Users,
  permissions: Shield,
}

function areaLabel(area: AuditArea, t: TranslateFn): string {
  if (area === 'all') {
    return t('audit:workspace_all_activity', { defaultValue: 'All Activity' })
  }
  return t(auditAreaI18nKey(area), {
    defaultValue: area.toUpperCase(),
  })
}

type Props = {
  t: TranslateFn
  activeWorkspaceId: string
  workspaces: AuditWorkspaceTab[]
  onActivate: (workspaceId: string) => void
  onCloseWorkspace: (workspaceId: string) => void
  onOpenArea: (area: AuditAreaTab) => void
}

export function AuditLogWorkspacesBar({
  t,
  activeWorkspaceId,
  workspaces,
  onActivate,
  onCloseWorkspace,
  onOpenArea,
}: Props) {
  const openAreaTabsKey = workspaces
    .filter((w) => w.area !== 'all')
    .map((w) => w.area)
    .sort()
    .join('|')

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <LayoutList className="size-3.5" />
          {t('audit:audit_area_label', { defaultValue: 'Audit Area' })}
        </span>
        <Select
          key={openAreaTabsKey || 'no-area-tabs'}
          onValueChange={(v) => {
            if (isAuditAreaTab(v)) onOpenArea(v)
          }}
        >
          <SelectTrigger className="h-8 w-[min(100%,220px)] text-xs">
            <SelectValue placeholder={t('audit:audit_area_open', { defaultValue: 'Open area…' })} />
          </SelectTrigger>
          <SelectContent>
            {AUDIT_AREA_TAB_IDS.map((area) => {
              const Icon = AREA_ICONS[area]
              return (
                <SelectItem key={area} value={area}>
                  <span className="inline-flex items-center gap-2">
                    <Icon className="size-3.5 opacity-70" />
                    {areaLabel(area, t)}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      <div className="relative -mx-1">
        <div className="flex gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
          {workspaces.map((ws) => {
            const active = ws.id === activeWorkspaceId
            const isAll = ws.id === ALL_ACTIVITY_WORKSPACE_ID
            const Icon = AREA_ICONS[ws.area]
            return (
              <div
                key={ws.id}
                className={cn(
                  'group flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                  active
                    ? 'border-slate-300 bg-white shadow-sm dark:border-border dark:bg-card'
                    : 'border-transparent bg-slate-100/80 text-muted-foreground hover:bg-slate-100 dark:bg-muted/40 dark:hover:bg-muted/60'
                )}
              >
                <button
                  type="button"
                  className="inline-flex max-w-[160px] items-center gap-1.5 truncate font-medium"
                  onClick={() => onActivate(ws.id)}
                >
                  <Icon className="size-3.5 shrink-0 opacity-80" />
                  <span className="truncate">{areaLabel(ws.area, t)}</span>
                  {typeof ws.resultTotal === 'number' && ws.resultTotal > 0 && (
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0 text-[10px] tabular-nums',
                        active ? 'bg-slate-100 dark:bg-muted' : 'bg-white/80 dark:bg-background/50'
                      )}
                    >
                      {ws.resultTotal > 999 ? '999+' : ws.resultTotal}
                    </span>
                  )}
                </button>
                {!isAll && (
                  <button
                    type="button"
                    className="rounded p-0.5 opacity-0 transition-opacity hover:bg-slate-200/80 group-hover:opacity-100 dark:hover:bg-muted"
                    aria-label={t('audit:workspace_close', { defaultValue: 'Close workspace' })}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCloseWorkspace(ws.id)
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
