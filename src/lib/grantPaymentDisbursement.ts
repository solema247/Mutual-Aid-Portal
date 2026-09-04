import { projectExpenseTotal } from '@/lib/poolProjectClassification'
import { normalizeProjectDonorToGrantId } from '@/lib/normalizeGrantId'

type ProjectRow = {
  id: string
  grant_id: string | null
  grant_grid_id: string | null
  mou_id: string | null
  expenses: unknown
  submitted_at?: string | null
}

function resolveGrantId(
  project: ProjectRow,
  gridIdToGrantId: Map<string, string>
): string | null {
  if (project.grant_grid_id) {
    const fromGrid = gridIdToGrantId.get(project.grant_grid_id)
    if (fromGrid) return fromGrid
  }
  const grantId = project.grant_id?.trim()
  return grantId || null
}

type HistoricalRow = {
  'Project Donor'?: string | null
  project_donor?: string | null
  USD?: number | null
  usd?: number | null
}

function registerGrantDonorKey(lookup: Map<string, string>, key: string, grantId: string) {
  const trimmed = key.trim()
  if (!trimmed) return
  lookup.set(trimmed, grantId)
  lookup.set(trimmed.toLowerCase(), grantId)
}

function buildGrantDonorLookup(grantIds: string[]): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const raw of grantIds) {
    const grantId = raw.trim()
    if (!grantId) continue
    registerGrantDonorKey(lookup, grantId, grantId)
    registerGrantDonorKey(lookup, normalizeProjectDonorToGrantId(grantId), grantId)
  }
  return lookup
}

function resolveGrantFromProjectDonor(
  donor: string | null | undefined,
  lookup: Map<string, string>
): string | null {
  if (donor == null) return null
  const trimmed = String(donor).trim()
  if (!trimmed) return null
  return (
    lookup.get(trimmed) ??
    lookup.get(trimmed.toLowerCase()) ??
    lookup.get(normalizeProjectDonorToGrantId(trimmed)) ??
    lookup.get(normalizeProjectDonorToGrantId(trimmed).toLowerCase()) ??
    null
  )
}

/** Historical spend from activities_raw_import, grouped by grants_grid_view.grant_id. */
export function sumHistoricalDisbursedByGrant(
  rows: HistoricalRow[],
  grantIds: string[]
): Record<string, number> {
  const lookup = buildGrantDonorLookup(grantIds)
  const totals: Record<string, number> = {}

  for (const row of rows) {
    const donor = row['Project Donor'] ?? row.project_donor
    const grantId = resolveGrantFromProjectDonor(donor, lookup)
    if (!grantId) continue
    const rawUsd = row.USD ?? row.usd
    if (rawUsd == null || rawUsd === undefined) continue
    const usd = Number(rawUsd)
    if (Number.isNaN(usd) || usd === 0) continue
    totals[grantId] = (totals[grantId] || 0) + usd
  }

  return totals
}

function mergeDisbursedTotals(
  portal: Record<string, number>,
  historical: Record<string, number>
): Record<string, number> {
  const totals = { ...historical }
  for (const [grantId, amount] of Object.entries(portal)) {
    totals[grantId] = (totals[grantId] || 0) + amount
  }
  return totals
}

/** Portal payment confirmations + historical activities_raw_import USD. */
export function sumDisbursedToErrsByGrant(
  projects: ProjectRow[],
  gridIdToGrantId: Map<string, string>,
  historicalRows: HistoricalRow[] = [],
  grantIds: string[] = [],
  confirmedProjectIds: Set<string> = new Set()
): Record<string, number> {
  const portalTotals: Record<string, number> = {}
  for (const project of projects) {
    if (!confirmedProjectIds.has(project.id)) continue
    const grantId = resolveGrantId(project, gridIdToGrantId)
    if (!grantId) continue
    portalTotals[grantId] = (portalTotals[grantId] || 0) + projectExpenseTotal(project.expenses)
  }

  const historicalTotals = sumHistoricalDisbursedByGrant(historicalRows, grantIds)
  return mergeDisbursedTotals(portalTotals, historicalTotals)
}

export type TransferActivityRow = {
  grant_id?: string | null
  fsp_id?: string | null
  activity_amount?: unknown
  status?: string | null
}

function grantLookupKey(raw: string | null | undefined): string {
  if (raw == null) return ''
  return String(raw).trim().toLowerCase().replace(/[\s_]+/g, '-')
}

/** Received activity_amount by grant lookup key, then FSP. Recalculated from current rows. */
export function receivedActivityWeightsByGrant(
  transfers: TransferActivityRow[]
): Map<string, Record<string, number>> {
  const byGrant = new Map<string, Record<string, number>>()
  for (const t of transfers) {
    const status = String(t.status || '').trim()
    if (status !== 'Received') continue
    const grantKey = grantLookupKey(t.grant_id)
    const fspId = t.fsp_id != null ? String(t.fsp_id).trim() : ''
    const activity = Number(t.activity_amount)
    if (!grantKey || !fspId || !Number.isFinite(activity) || activity <= 0) continue
    const weights = byGrant.get(grantKey) || {}
    weights[fspId] = (weights[fspId] || 0) + activity
    byGrant.set(grantKey, weights)
  }
  return byGrant
}

/** Split cents across FSPs with largest-remainder so totals stay exact. */
export function splitAmountByWeights(
  amount: number,
  weights: Record<string, number>
): Record<string, number> {
  const entries = Object.entries(weights).filter(([, w]) => Number.isFinite(w) && w > 0)
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0)
  if (entries.length === 0 || totalWeight <= 0 || !Number.isFinite(amount) || amount === 0) {
    return {}
  }
  const cents = Math.round(amount * 100)
  const parts = entries.map(([id, w]) => {
    const raw = (cents * w) / totalWeight
    const n = Math.floor(raw)
    return { id, n, frac: raw - n }
  })
  let leftover = cents - parts.reduce((sum, p) => sum + p.n, 0)
  parts.sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id))
  for (let i = 0; leftover > 0 && parts.length > 0; i++, leftover--) {
    parts[i % parts.length].n += 1
  }
  const split: Record<string, number> = {}
  for (const p of parts) {
    if (p.n) split[p.id] = p.n / 100
  }
  return split
}

function addSplit(
  totals: Record<string, number>,
  split: Record<string, number>
) {
  for (const [fspId, amount] of Object.entries(split)) {
    totals[fspId] = (totals[fspId] || 0) + amount
  }
}

/**
 * Treasury out for confirmed projects, recalculated from current expenses.
 * Splits each project's F1 expense total across FSPs in the same ratio as
 * Received transfer activity on that grant. If the grant has no Received
 * activity, falls back to the latest confirmation FSP.
 */
export function sumDisbursedToErrsByFsp(
  projects: ProjectRow[],
  confirmedProjectIds: Set<string> = new Set(),
  confirmationFspByProject: Record<string, string | null> = {},
  transfers: TransferActivityRow[] = [],
  gridIdToGrantId: Map<string, string> = new Map()
): Record<string, number> {
  const totals: Record<string, number> = {}
  const weightsByGrant = receivedActivityWeightsByGrant(transfers)

  for (const project of projects) {
    if (!confirmedProjectIds.has(project.id) || !project.mou_id) continue
    const expense = projectExpenseTotal(project.expenses)
    if (!expense) continue

    const grantId = resolveGrantId(project, gridIdToGrantId)
    const weights = grantId ? weightsByGrant.get(grantLookupKey(grantId)) : undefined
    if (weights && Object.keys(weights).length > 0) {
      addSplit(totals, splitAmountByWeights(expense, weights))
      continue
    }

    const fallbackFsp = confirmationFspByProject[project.id]?.trim()
    if (fallbackFsp) totals[fallbackFsp] = (totals[fallbackFsp] || 0) + expense
  }
  return totals
}
