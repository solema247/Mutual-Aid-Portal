import type { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  summarizeConfirmationsForReporting,
  supplementReportingPaymentsFromLegacyMous,
  type ReportingConfirmationRow,
  type ReportingPaymentSlice,
} from '@/lib/mouPaymentConfirmations'
import { chunkIds, grantAmountUsd } from './listCommon'

const REPORTING_CONFIRMATION_SELECT = 'project_id, exchange_rate, transfer_date, created_at'

function normalizeConfirmationRow(row: {
  project_id: string
  exchange_rate: unknown
  transfer_date: string | null
  created_at: string
}): ReportingConfirmationRow {
  return {
    project_id: row.project_id,
    transfer_date: row.transfer_date,
    created_at: row.created_at,
    exchange_rate:
      row.exchange_rate == null || Number.isNaN(Number(row.exchange_rate))
        ? null
        : Number(row.exchange_rate),
  }
}

async function loadRelationalReportingConfirmations(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  projectIds: string[]
): Promise<ReportingConfirmationRow[]> {
  if (!projectIds.length) return []

  const batches = chunkIds(projectIds)
  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from('mou_payment_confirmations')
        .select(REPORTING_CONFIRMATION_SELECT)
        .in('project_id', batch)

      if (error) {
        console.warn('[f4f5/paymentSummary] relational batch failed, using legacy', error.message)
        return [] as ReportingConfirmationRow[]
      }
      return (data || []).map((row) => normalizeConfirmationRow(row as ReportingConfirmationRow))
    })
  )
  return batchResults.flat()
}

/**
 * Batched payment read path for F4/F5 reporting lists: transfer_date + exchange_rate only.
 */
export async function loadReportingPaymentMaps(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  mouIds: string[],
  projectById: Map<string, Record<string, unknown>>
): Promise<{ transferDateByProject: Record<string, string>; rateByProject: Record<string, number> }> {
  const transferDateByProject: Record<string, string> = {}
  const rateByProject: Record<string, number> = {}

  const projectIds = Array.from(projectById.keys())
  if (projectIds.length === 0 || mouIds.length === 0) {
    return { transferDateByProject, rateByProject }
  }

  const confirmations = await loadRelationalReportingConfirmations(supabase, projectIds)
  const slices: Record<string, ReportingPaymentSlice> = summarizeConfirmationsForReporting(confirmations)

  const uniqueMouIds = [...new Set(mouIds.filter(Boolean))]

  const missingRelational = projectIds.filter((id) => !slices[id])
  if (missingRelational.length > 0) {
    await supplementReportingPaymentsFromLegacyMous(supabase, uniqueMouIds, slices, {
      onlyProjectIds: missingRelational,
    })
  }

  for (const [projectId, slice] of Object.entries(slices)) {
    if (slice.transfer_date) transferDateByProject[projectId] = slice.transfer_date
    if (slice.exchange_rate != null) rateByProject[projectId] = slice.exchange_rate
  }

  if (uniqueMouIds.length > 0) {
    for (const batch of chunkIds(uniqueMouIds)) {
      const { data: mousRows } = await supabase.from('mous').select('id, exchange_rate').in('id', batch)
      for (const mou of mousRows || []) {
        const mouRate = (mou as { exchange_rate?: number }).exchange_rate
        if (typeof mouRate !== 'number' || mouRate <= 0) continue
        for (const [pid, project] of projectById) {
          if (String(project.mou_id) === String((mou as { id: string }).id) && rateByProject[pid] == null) {
            rateByProject[pid] = mouRate
          }
        }
      }
    }
  }

  return { transferDateByProject, rateByProject }
}

export const EMPTY_PAYMENT_MAPS = {
  transferDateByProject: {} as Record<string, string>,
  rateByProject: {} as Record<string, number>,
}

export function computeMouIdsForProjects(projects: Iterable<Record<string, unknown>>): string[] {
  const ids = new Set<string>()
  for (const p of projects) {
    const mouId = p.mou_id
    if (mouId) ids.add(String(mouId))
  }
  return [...ids]
}

/** Distinct scoped portal project IDs on a list page (excludes historical rows). */
export function getPageProjectIdsForPayment(pageRows: Record<string, unknown>[]): string[] {
  const ids = new Set<string>()
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    ids.add(String(pid))
  }
  return [...ids]
}

export function buildPageProjectById(
  pageProjectIds: string[],
  projectById: Map<string, Record<string, unknown>>
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>()
  for (const id of pageProjectIds) {
    const p = projectById.get(id)
    if (p) out.set(id, p)
  }
  return out
}

function mergedWithPlan(
  projectId: string,
  projectById: Map<string, Record<string, unknown>>,
  planByProject?: Map<string, Record<string, unknown>>
): Record<string, unknown> | null {
  const base = projectById.get(projectId)
  if (!base) return null
  const extra = planByProject?.get(projectId)
  return extra ? { ...base, ...extra } : base
}

export function enrichF4ListPaymentFields(
  pageRows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>,
  transferDateByProject: Record<string, string>,
  rateByProject: Record<string, number>,
  planByProject?: Map<string, Record<string, unknown>>,
  planProjectIdsForAmount?: Set<string>
) {
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const projectId = String(pid)
    const project = projectById.get(projectId)
    if (!project) continue

    row.payment_date =
      transferDateByProject[projectId] || (project.date_transfer as string | null) || null
    row.exchange_rate = rateByProject[projectId] ?? null

    const allowAmountSdg =
      row.has_f4_report === false ||
      (planProjectIdsForAmount != null && planProjectIdsForAmount.has(projectId))
    if (!allowAmountSdg) continue
    const merged = mergedWithPlan(projectId, projectById, planByProject)
    if (!merged) continue
    const planUsd = grantAmountUsd(merged)
    const rate = rateByProject[projectId] ?? null
    row.amount_sdg = rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null
  }
}

export function enrichF5ListPaymentFields(
  pageRows: Record<string, unknown>[],
  projectById: Map<string, Record<string, unknown>>,
  transferDateByProject: Record<string, string>,
  rateByProject: Record<string, number>,
  planByProject?: Map<string, Record<string, unknown>>
) {
  for (const row of pageRows) {
    const pid = row.project_id
    if (pid == null || String(pid).startsWith('historical_')) continue
    const projectId = String(pid)
    const project = projectById.get(projectId)
    if (!project) continue

    row.payment_date =
      transferDateByProject[projectId] || (project.date_transfer as string | null) || null
    row.exchange_rate = rateByProject[projectId] ?? null

    const merged = mergedWithPlan(projectId, projectById, planByProject)
    if (!merged) continue
    const planUsd = grantAmountUsd(merged)
    const rate = rateByProject[projectId] ?? null
    row.amount_sdg = rate != null && planUsd > 0 ? Math.round(planUsd * rate) : null
  }
}
