/**
 * Client-side audit list pagination state (keyset cursor map per workspace).
 */

export const INITIAL_START_CURSOR_BY_PAGE: Record<number, string | null> = { 1: null }

export type AuditListGenerationInput = {
  area: string
  pageSize: number
  search: string
  actions: string[]
  targetTypes: string[]
  actors: string[]
  dateFrom: string
  dateTo: string
}

export function buildAuditListGeneration(input: AuditListGenerationInput): string {
  return JSON.stringify({
    area: input.area,
    pageSize: input.pageSize,
    search: input.search,
    actions: input.actions.slice().sort(),
    targetTypes: input.targetTypes.slice().sort(),
    actors: input.actors.slice().sort(),
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  })
}

/** Cursor query param for this logical page (page 1 never sends a cursor). */
export function getPageFetchCursor(
  page: number,
  startCursorByPage: Record<number, string | null>
): string | null {
  if (page <= 1) return null
  const c = startCursorByPage[page]
  return c ?? null
}

export function mergeNextPageCursor(
  startCursorByPage: Record<number, string | null>,
  currentPage: number,
  nextCursor: string | null | undefined
): Record<number, string | null> {
  if (!nextCursor) return startCursorByPage
  return { ...startCursorByPage, [currentPage + 1]: nextCursor }
}

export function resetStartCursorByPage(): Record<number, string | null> {
  return { ...INITIAL_START_CURSOR_BY_PAGE }
}
