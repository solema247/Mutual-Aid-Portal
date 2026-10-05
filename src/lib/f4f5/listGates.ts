import type { SupabaseClient } from '@supabase/supabase-js'
import { isReportingStatusCompleted } from '../projectStatus'
import {
  classifyF4ListRowForSummary,
  classifyF5ListRowForSummary,
} from './listSummary'

const SUPABASE_IN_BATCH = 80

function chunkIds(ids: string[]): string[][] {
  if (ids.length === 0) return []
  const out: string[][] = []
  for (let i = 0; i < ids.length; i += SUPABASE_IN_BATCH) {
    out.push(ids.slice(i, i + SUPABASE_IN_BATCH))
  }
  return out
}

function uniqueGrantGridIdsFromProjects(projects: Record<string, unknown>[]): string[] {
  return [
    ...new Set(
      projects
        .map((p) => (p.grant_grid_id != null ? String(p.grant_grid_id).trim() : ''))
        .filter(Boolean)
    ),
  ]
}

export type CompletionMode = 'active' | 'completed' | 'all'

export function parseCompletionMode(raw: string | null | undefined): CompletionMode {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'active' || v === 'completed') return v
  return 'all'
}

export async function loadExistingGrantGridIds(
  supabase: SupabaseClient,
  gridIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>()
  if (!gridIds.length) return out
  for (const batch of chunkIds(gridIds)) {
    const { data, error } = await supabase.from('grants_grid_view').select('id').in('id', batch)
    if (error) throw error
    for (const row of data || []) {
      out.add(String((row as { id: string }).id))
    }
  }
  return out
}

export function hasValidGrantAssignment(
  project: Record<string, unknown>,
  validGrantGridIds: Set<string>
): boolean {
  const gridId = project.grant_grid_id != null ? String(project.grant_grid_id).trim() : ''
  return gridId !== '' && validGrantGridIds.has(gridId)
}

export async function filterGrantAssignedProjects(
  supabase: SupabaseClient,
  projects: Record<string, unknown>[]
): Promise<{ projects: Record<string, unknown>[]; validGrantGridIds: Set<string> }> {
  const gridIds = uniqueGrantGridIdsFromProjects(projects)
  const validGrantGridIds = await loadExistingGrantGridIds(supabase, gridIds)
  const filtered = projects.filter((p) => hasValidGrantAssignment(p, validGrantGridIds))
  return { projects: filtered, validGrantGridIds }
}

/** Pre-fetch gate aligned with `classifyF4ListRowForSummary` (project-level). */
export function projectMatchesF4CompletionMode(
  project: Record<string, unknown>,
  mode: CompletionMode
): boolean {
  if (mode === 'all') return true
  const completed = isReportingStatusCompleted(project.f4_status as string | null | undefined)
  return mode === 'completed' ? completed : !completed
}

/** Pre-fetch gate aligned with `classifyF5ListRowForSummary` (project-level). */
export function projectMatchesF5CompletionMode(
  project: Record<string, unknown>,
  mode: CompletionMode
): boolean {
  if (mode === 'all') return true
  const completed = isReportingStatusCompleted(project.f5_status as string | null | undefined)
  return mode === 'completed' ? completed : !completed
}

export function filterProjectsByF4Completion(
  projects: Record<string, unknown>[],
  mode: CompletionMode
): Record<string, unknown>[] {
  if (mode === 'all') return projects
  return projects.filter((p) => projectMatchesF4CompletionMode(p, mode))
}

export function filterProjectsByF5Completion(
  projects: Record<string, unknown>[],
  mode: CompletionMode
): Record<string, unknown>[] {
  if (mode === 'all') return projects
  return projects.filter((p) => projectMatchesF5CompletionMode(p, mode))
}

export function shouldIncludeHistoricalF4Rows(completion: CompletionMode): boolean {
  return completion !== 'completed'
}

/** Row-level check using canonical summary classifiers (tests / safety). */
export function rowMatchesF4CompletionMode(
  row: Parameters<typeof classifyF4ListRowForSummary>[0],
  mode: CompletionMode
): boolean {
  if (mode === 'all') return true
  const bucket = classifyF4ListRowForSummary(row)
  if (mode === 'completed') return bucket === 'completed'
  return bucket !== 'completed'
}

export function rowMatchesF5CompletionMode(
  row: Parameters<typeof classifyF5ListRowForSummary>[0],
  mode: CompletionMode
): boolean {
  if (mode === 'all') return true
  const bucket = classifyF5ListRowForSummary(row)
  if (mode === 'completed') return bucket === 'completed'
  return bucket !== 'completed'
}
