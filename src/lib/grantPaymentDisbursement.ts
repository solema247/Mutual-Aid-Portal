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

type MouRow = {
  id: string
  payment_confirmation_file: string | null
  exchange_rate: number | null
  transfer_date: string | null
  fsp_id?: string | null
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

/** F3 payment confirmations grouped by the MOU's FSP. Zero until mous.fsp_id is backfilled. */
export function sumDisbursedToErrsByFsp(
  projects: ProjectRow[],
  mous: MouRow[],
  confirmedProjectIds: Set<string> = new Set()
): Record<string, number> {
  const mouById = new Map(mous.map((m) => [m.id, m]))
  const totals: Record<string, number> = {}

  for (const project of projects) {
    if (!confirmedProjectIds.has(project.id) || !project.mou_id) continue
    const fspId = mouById.get(project.mou_id)?.fsp_id?.trim()
    if (!fspId) continue
    totals[fspId] = (totals[fspId] || 0) + projectExpenseTotal(project.expenses)
  }
  return totals
}
