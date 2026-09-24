/**
 * Server-only: batch-resolve Audit Log target labels for a page of rows.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function metaString(meta: Record<string, unknown> | null, key: string): string | null {
  if (!meta) return null
  const v = meta[key]
  if (v == null || v === '') return null
  return String(v)
}

function projectDisplayLabel(row: {
  grant_id?: string | null
  grant_grid_id?: string | null
  id?: string
}): string {
  const grant = row.grant_id?.trim()
  if (grant) return grant
  const grid = row.grant_grid_id?.trim()
  if (grid) return grid
  if (row.id) return row.id.slice(0, 8)
  return 'Project'
}

export type AuditTargetDisplay = {
  type: string | null
  id: string | null
  display_name: string | null
  secondary: string | null
  role_key: string | null
}

type RowLite = {
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  new_values?: Record<string, unknown> | null
}

export function collectEnrichmentIds(rows: RowLite[]): {
  projectIds: string[]
  mouIds: string[]
  paymentConfirmationIds: string[]
} {
  const projectIds = new Set<string>()
  const mouIds = new Set<string>()
  const paymentConfirmationIds = new Set<string>()

  for (const row of rows) {
    const meta = row.metadata
    const tid = row.target_id
    const tt = row.target_type

    if (tt === 'project' && tid && isUuid(tid)) projectIds.add(tid)
    if (tt === 'project_document' && tid && isUuid(tid)) {
      /* target is document id; project may be in metadata */
    }
    if (tt === 'f4_summary' && tid && isUuid(tid)) projectIds.add(tid)
    if (tt === 'mou' && tid && isUuid(tid)) mouIds.add(tid)
    if (tt === 'payment_confirmation' && tid && isUuid(tid)) {
      paymentConfirmationIds.add(tid)
    }

    const projectMeta = metaString(meta, 'project_id')
    if (projectMeta && isUuid(projectMeta)) projectIds.add(projectMeta)

    const mouMeta = metaString(meta, 'mou_id')
    if (mouMeta && isUuid(mouMeta)) mouIds.add(mouMeta)

    if (tt === 'payment_file') {
      const confId = row.new_values?.payment_confirmation_id
      if (typeof confId === 'string' && isUuid(confId)) paymentConfirmationIds.add(confId)
    }
  }

  return {
    projectIds: [...projectIds],
    mouIds: [...mouIds],
    paymentConfirmationIds: [...paymentConfirmationIds],
  }
}

export async function fetchEnrichmentLookups(
  admin: SupabaseClient,
  ids: ReturnType<typeof collectEnrichmentIds>
): Promise<{
  projects: Record<string, string>
  mous: Record<string, string>
  paymentConfirmations: Record<string, string>
}> {
  const projects: Record<string, string> = {}
  const mous: Record<string, string> = {}
  const paymentConfirmations: Record<string, string> = {}

  if (ids.projectIds.length > 0) {
    const { data } = await admin
      .from('err_projects')
      .select('id, grant_id, grant_grid_id')
      .in('id', ids.projectIds)
    for (const p of data ?? []) {
      if (p.id) projects[p.id] = projectDisplayLabel(p)
    }
  }

  if (ids.mouIds.length > 0) {
    const { data } = await admin.from('mous').select('id, grant_id').in('id', ids.mouIds)
    for (const m of data ?? []) {
      if (m.id) {
        const label = (m.grant_id as string | null)?.trim()
        mous[m.id] = label || `MOU ${String(m.id).slice(0, 8)}`
      }
    }
  }

  if (ids.paymentConfirmationIds.length > 0) {
    const { data } = await admin
      .from('mou_payment_confirmations')
      .select('id, mou_id, transfer_date')
      .in('id', ids.paymentConfirmationIds)
    for (const c of data ?? []) {
      if (c.id) {
        const date = c.transfer_date ? String(c.transfer_date).slice(0, 10) : null
        paymentConfirmations[c.id] = date
          ? `Payment ${date}`
          : `Payment ${String(c.id).slice(0, 8)}`
      }
    }
  }

  return { projects, mous, paymentConfirmations }
}

export function resolveAuditTargetDisplay(args: {
  row: RowLite
  newValues?: Record<string, unknown> | null
  targetUser?: {
    display_name: string | null
    role: string | null
    email: string | null
  } | null
  roleKey?: string | null
  lookups: {
    projects: Record<string, string>
    mous: Record<string, string>
    paymentConfirmations: Record<string, string>
  }
}): AuditTargetDisplay | null {
  const { row, targetUser, roleKey, lookups, newValues } = args
  const tt = row.target_type
  const tid = row.target_id
  const meta = row.metadata

  if (!tt) return null

  if (tt === 'user' && tid) {
    return {
      type: 'user',
      id: tid,
      display_name: targetUser?.display_name ?? null,
      secondary: targetUser?.email ?? null,
      role_key: targetUser?.role ?? null,
    }
  }

  if (tt === 'role') {
    return {
      type: 'role',
      id: null,
      display_name: null,
      secondary: null,
      role_key: roleKey ?? null,
    }
  }

  const projectId =
    (tt === 'project' || tt === 'f4_summary' ? tid : null) ||
    metaString(meta, 'project_id')
  const projectLabel =
    projectId && lookups.projects[projectId] ? lookups.projects[projectId] : null

  if (tt === 'project') {
    const resolvedId = tid && isUuid(tid) ? tid : projectId
    return {
      type: 'project',
      id: resolvedId,
      display_name:
        projectLabel ||
        (resolvedId && lookups.projects[resolvedId]) ||
        (resolvedId && isUuid(resolvedId) ? resolvedId.slice(0, 8) : null),
      secondary:
        projectLabel && resolvedId && isUuid(resolvedId)
          ? resolvedId
          : resolvedId && isUuid(resolvedId)
            ? resolvedId
            : null,
      role_key: null,
    }
  }

  if (tt === 'f4_summary') {
    const summaryId = metaString(meta, 'summary_id')
    return {
      type: 'f4_summary',
      id: tid,
      display_name: projectLabel || (projectId ? projectId.slice(0, 8) : null),
      secondary: summaryId ? `Summary #${summaryId}` : tid && isUuid(tid) ? tid.slice(0, 8) : null,
      role_key: null,
    }
  }

  if (tt === 'f5_report') {
    const reportMeta = metaString(meta, 'report_id') || tid
    return {
      type: 'f5_report',
      id: tid,
      display_name: projectLabel || null,
      secondary: reportMeta
        ? `Report ${reportMeta.length > 12 ? `${reportMeta.slice(0, 8)}…` : reportMeta}`
        : null,
      role_key: null,
    }
  }

  if (tt === 'mou' && tid) {
    return {
      type: 'mou',
      id: tid,
      display_name: lookups.mous[tid] || `MOU ${tid.slice(0, 8)}`,
      secondary: metaString(meta, 'grant_id') || null,
      role_key: null,
    }
  }

  if (tt === 'payment_confirmation' && tid) {
    const mouId = metaString(meta, 'mou_id')
    return {
      type: 'payment_confirmation',
      id: tid,
      display_name: lookups.paymentConfirmations[tid] || `Payment ${tid.slice(0, 8)}`,
      secondary: mouId && lookups.mous[mouId] ? lookups.mous[mouId] : mouId,
      role_key: null,
    }
  }

  if (tt === 'payment_file' && tid) {
    const fileName =
      typeof newValues?.original_name === 'string' && newValues.original_name.trim()
        ? newValues.original_name.trim()
        : null
    const confId =
      typeof newValues?.payment_confirmation_id === 'string'
        ? newValues.payment_confirmation_id
        : null
    const confLabel = confId ? lookups.paymentConfirmations[confId] : null
    return {
      type: 'payment_file',
      id: tid,
      display_name: fileName || `File ${tid.slice(0, 8)}`,
      secondary: confLabel || metaString(meta, 'mou_id'),
      role_key: null,
    }
  }

  if (tt === 'project_document') {
    return {
      type: 'project_document',
      id: tid,
      display_name: projectLabel || (projectId ? projectId.slice(0, 8) : null),
      secondary: metaString(meta, 'document_id') || tid,
      role_key: null,
    }
  }

  if (tt === 'role_defaults') {
    const role = metaString(meta, 'role') || roleKey
    return {
      type: 'role_defaults',
      id: null,
      display_name: role,
      secondary: null,
      role_key: role,
    }
  }

  if (tt === 'system') {
    return {
      type: 'system',
      id: tid,
      display_name: null,
      secondary: null,
      role_key: null,
    }
  }

  return {
    type: tt,
    id: tid,
    display_name: tid && isUuid(tid) ? tid.slice(0, 8) : tid,
    secondary: null,
    role_key: null,
  }
}
