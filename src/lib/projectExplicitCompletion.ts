/** Row fields used by PATCH /api/projects/[id]/status (explicit completion). */
export type ProjectExplicitCompletionRow = {
  status: string | null
  completed_at: string | null
  f4_status?: string | null
  f5_status?: string | null
}

function normalizeProjectStatus(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase()
}

/** True when repeating PATCH { status: 'completed' } on an already completed project. */
export function isExplicitProjectCompletionNoop(
  project: Pick<ProjectExplicitCompletionRow, 'status'>,
  newStatus: string
): boolean {
  if (normalizeProjectStatus(newStatus) !== 'completed') return false
  return normalizeProjectStatus(project.status) === 'completed'
}

export function projectCompletedAuditOldValues(
  project: Pick<ProjectExplicitCompletionRow, 'status' | 'completed_at'>
): { status: string | null; completed_at: string | null } {
  return {
    status: project.status ?? null,
    completed_at: project.completed_at ?? null,
  }
}

export function projectCompletedAuditNewValues(completedAt: string): {
  status: 'completed'
  completed_at: string
} {
  return {
    status: 'completed',
    completed_at: completedAt,
  }
}
