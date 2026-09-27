'use client'

import { getPortalRoleLabel } from '@/lib/roleLabels'
import {
  auditTargetTypeI18nKey,
  getAuditTargetTypeFallback,
} from '@/lib/auditTargetTypeLabels'
import type { AuditDetailLookups } from './AuditDetailValue'
import type { AuditDetailTranslate } from './auditFieldLabels'

export type AuditTargetShape = {
  type: string | null
  id: string | null
  display_name: string | null
  secondary: string | null
  role_key: string | null
} | null

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function metaProjectId(metadata: Record<string, unknown> | null | undefined): string | null {
  const v = metadata?.project_id
  if (typeof v === 'string' && v.trim() && isUuid(v.trim())) return v.trim()
  return null
}

function inferTargetType(
  target: AuditTargetShape,
  action: string | undefined
): string | null {
  if (target?.type) return target.type
  if (action === 'f2.project_edited' || action?.startsWith('f2.project_')) return 'project'
  if (action?.startsWith('f4.')) return 'f4_summary'
  if (action?.startsWith('f5.')) return 'f5_report'
  if (action?.startsWith('project.')) return 'project'
  return null
}

function targetTypeLabel(type: string | null | undefined, t: AuditDetailTranslate): string {
  if (!type) return t('audit:details_empty', { defaultValue: '—' })
  return t(auditTargetTypeI18nKey(type), {
    defaultValue: getAuditTargetTypeFallback(type),
  })
}

export function resolveProjectIdForDisplay(args: {
  target: AuditTargetShape
  metadata?: Record<string, unknown> | null
}): string | null {
  const { target, metadata } = args
  const tt = target?.type
  if (tt === 'project' && target?.id && isUuid(target.id)) return target.id
  if (tt === 'f4_summary' && target?.id && isUuid(target.id)) return target.id
  if (tt === 'project_document') {
    const fromMeta = metaProjectId(metadata ?? null)
    if (fromMeta) return fromMeta
  }
  return metaProjectId(metadata ?? null) || (target?.id && isUuid(target.id) ? target.id : null)
}

export function AuditTargetDisplay({
  target,
  action,
  metadata,
  lookups,
  t,
}: {
  target: AuditTargetShape
  action?: string
  metadata?: Record<string, unknown> | null
  lookups: AuditDetailLookups
  t: AuditDetailTranslate
}) {
  const type = inferTargetType(target, action)

  if (!type) {
    const projectId = resolveProjectIdForDisplay({ target, metadata })
    if (projectId) {
      const label = lookups.projects[projectId]
      return (
        <>
          <div className="truncate text-sm font-medium">
            {label || projectId.slice(0, 8)}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {[targetTypeLabel('project', t), label ? projectId : null].filter(Boolean).join(' · ')}
          </div>
        </>
      )
    }
    return (
      <div className="text-sm text-muted-foreground">
        {t('audit:unknown_target', { defaultValue: 'Unknown target' })}
      </div>
    )
  }

  if (type === 'role') {
    return (
      <>
        <div className="truncate text-sm font-medium">
          {target?.role_key
            ? getPortalRoleLabel(target.role_key, t)
            : t('audit:target_role')}
        </div>
        <div className="text-[11px] text-muted-foreground">{targetTypeLabel(type, t)}</div>
      </>
    )
  }

  if (type === 'user') {
    return (
      <>
        <div className="truncate text-sm font-medium">
          {target?.display_name || t('audit:unknown_user')}
        </div>
        {target?.secondary && (
          <div className="truncate text-[11px] text-muted-foreground">{target.secondary}</div>
        )}
      </>
    )
  }

  if (type === 'system') {
    return (
      <div className="text-sm font-medium">
        {t('audit:source_system', { defaultValue: 'System' })}
      </div>
    )
  }

  const projectId = resolveProjectIdForDisplay({ target, metadata })
  const projectLabel = projectId ? lookups.projects[projectId] : null

  let primary =
    target?.display_name ||
    projectLabel ||
    (target?.id && target.id.length > 12 ? `${target.id.slice(0, 8)}…` : target?.id) ||
    (projectId ? projectId.slice(0, 8) : null)

  let secondaryParts: string[] = [targetTypeLabel(type, t)]

  if (type === 'f4_summary') {
    const summaryId = metadata?.summary_id
    if (summaryId != null && String(summaryId).trim()) {
      secondaryParts.push(`Summary #${String(summaryId)}`)
    } else if (target?.secondary) {
      secondaryParts.push(target.secondary)
    }
  } else if (type === 'f5_report') {
    if (target?.secondary) secondaryParts.push(target.secondary)
  } else if (type === 'project') {
    if (projectLabel && projectId) secondaryParts.push(projectId)
    else if (target?.secondary) secondaryParts.push(target.secondary)
    else if (projectId) secondaryParts.push(projectId)
  } else {
    if (target?.secondary) secondaryParts.push(target.secondary)
  }

  if (!primary) {
    primary = t('audit:unknown_target', { defaultValue: 'Unknown target' })
    secondaryParts = secondaryParts.filter((p) => p !== primary)
  }

  return (
    <>
      <div className="truncate text-sm font-medium">{primary}</div>
      <div className="truncate text-[11px] text-muted-foreground">
        {secondaryParts.filter(Boolean).join(' · ')}
      </div>
    </>
  )
}

export { targetTypeLabel as auditTargetTypeLabel }
