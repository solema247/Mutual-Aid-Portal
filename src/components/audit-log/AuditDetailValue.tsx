'use client'

import { cn } from '@/lib/utils'
import { getPortalRoleLabel } from '@/lib/roleLabels'
import {
  auditFieldLabel,
  isRecord,
  type AuditDetailTranslate,
} from './auditFieldLabels'

export type AuditDetailLookups = {
  partners: Record<string, string>
  rooms: Record<string, string>
  states: Record<string, string>
  projects: Record<string, string>
  mous: Record<string, string>
}

const STRUCTURED_ARRAY_KEYS = new Set(['expenses', 'planned_activities'])

function JsonBlock({ text }: { text: string }) {
  return (
    <pre
      className={cn(
        'max-h-48 overflow-auto rounded-md border border-slate-100 bg-white/80 p-2',
        'whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed',
        'dark:border-border/40 dark:bg-background/60'
      )}
    >
      {text}
    </pre>
  )
}

function PrimitiveText({ children }: { children: string }) {
  return <span className="text-sm break-words">{children}</span>
}

function StructuredObjectCard({
  item,
  index,
  lookups,
  t,
  nestedKey,
}: {
  item: Record<string, unknown>
  index: number
  lookups: AuditDetailLookups
  t: AuditDetailTranslate
  nestedKey?: string
}) {
  const entries = Object.entries(item)
  return (
    <div className="rounded-md border border-slate-100 bg-white/70 p-2.5 dark:border-border/40 dark:bg-background/40">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t('audit:detail_item_index', {
          index: index + 1,
          defaultValue: `#${index + 1}`,
        })}
      </div>
      {entries.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t('audit:details_empty', { defaultValue: '—' })}
        </span>
      ) : (
        <dl className="space-y-1.5">
          {entries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] font-medium text-muted-foreground">
                {auditFieldLabel(k, t)}
              </dt>
              <dd className="mt-0.5">
                <AuditDetailValue
                  fieldKey={nestedKey ? `${nestedKey}.${k}` : k}
                  value={v}
                  lookups={lookups}
                  t={t}
                />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function formatPrimitiveForDisplay(
  fieldKey: string,
  value: unknown,
  lookups: AuditDetailLookups,
  t: AuditDetailTranslate
): string | null {
  if (value == null) return null
  if (typeof value === 'boolean') {
    return value
      ? t('audit:yes', { defaultValue: 'Yes' })
      : t('audit:no', { defaultValue: 'No' })
  }
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (fieldKey === 'role' || fieldKey.endsWith('.role')) {
      return getPortalRoleLabel(value, t) || value
    }
    if (fieldKey === 'partner_id' || fieldKey.endsWith('.partner_id')) {
      return lookups.partners[value] || value
    }
    if (fieldKey === 'err_id' || fieldKey.endsWith('.err_id')) {
      return lookups.rooms[value] || value
    }
    if (fieldKey === 'project_id' || fieldKey.endsWith('.project_id')) {
      return lookups.projects[value] || value
    }
    if (fieldKey === 'mou_id' || fieldKey.endsWith('.mou_id')) {
      return lookups.mous[value] || value
    }
    return value
  }
  return null
}

export function AuditDetailValue({
  fieldKey,
  value,
  lookups,
  t,
}: {
  fieldKey: string
  value: unknown
  lookups: AuditDetailLookups
  t: AuditDetailTranslate
}) {
  if (value == null) {
    return (
      <span className="text-sm text-muted-foreground">
        {t('audit:details_empty', { defaultValue: '—' })}
      </span>
    )
  }

  const primitive = formatPrimitiveForDisplay(fieldKey, value, lookups, t)
  if (primitive != null) {
    return <PrimitiveText>{primitive}</PrimitiveText>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <span className="text-sm text-muted-foreground">
          {t('audit:summary_empty_list', { defaultValue: '(empty)' })}
        </span>
      )
    }

    if (fieldKey === 'visible_states') {
      const labels = value.map((id) =>
        typeof id === 'string' ? lookups.states[id] || id : String(id)
      )
      return <PrimitiveText>{labels.join(', ')}</PrimitiveText>
    }

    const allObjects = value.every(isRecord)
    const preferStructured = STRUCTURED_ARRAY_KEYS.has(fieldKey) || allObjects

    if (preferStructured && value.some(isRecord)) {
      return (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {value.map((entry, index) => (
            <li key={index}>
              {isRecord(entry) ? (
                <StructuredObjectCard
                  item={entry}
                  index={index}
                  lookups={lookups}
                  t={t}
                  nestedKey={fieldKey}
                />
              ) : (
                <AuditDetailValue
                  fieldKey={`${fieldKey}[]`}
                  value={entry}
                  lookups={lookups}
                  t={t}
                />
              )}
            </li>
          ))}
        </ul>
      )
    }

    return (
      <ul className="list-inside list-disc space-y-0.5 text-sm">
        {value.map((entry, index) => (
          <li key={index}>
            <AuditDetailValue
              fieldKey={`${fieldKey}[]`}
              value={entry}
              lookups={lookups}
              t={t}
            />
          </li>
        ))}
      </ul>
    )
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) {
      return (
        <span className="text-sm text-muted-foreground">
          {t('audit:details_empty', { defaultValue: '—' })}
        </span>
      )
    }
    return (
      <dl className="space-y-1.5 rounded-md border border-slate-100 bg-white/50 p-2 dark:border-border/40 dark:bg-background/30">
        {entries.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] font-medium text-muted-foreground">
              {auditFieldLabel(k, t)}
            </dt>
            <dd className="mt-0.5">
              <AuditDetailValue fieldKey={k} value={v} lookups={lookups} t={t} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }

  try {
    return <JsonBlock text={JSON.stringify(value, null, 2)} />
  } catch {
    return <PrimitiveText>{String(value)}</PrimitiveText>
  }
}

export function AuditValuesSection({
  title,
  values,
  lookups,
  t,
}: {
  title: string
  values: Record<string, unknown> | null
  lookups: AuditDetailLookups
  t: AuditDetailTranslate
}) {
  if (!values || Object.keys(values).length === 0) {
    return (
      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        <p className="text-sm text-muted-foreground">
          {t('audit:details_empty', { defaultValue: '—' })}
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      <dl className="space-y-3 rounded-md border border-slate-100 bg-slate-50/60 p-3 dark:border-border/40 dark:bg-muted/20">
        {Object.entries(values).map(([key, value]) => (
          <div key={key} className="grid gap-0.5">
            <dt className="text-[11px] font-medium text-muted-foreground">
              {auditFieldLabel(key, t)}
            </dt>
            <dd className="min-w-0 text-foreground">
              <AuditDetailValue fieldKey={key} value={value} lookups={lookups} t={t} />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
