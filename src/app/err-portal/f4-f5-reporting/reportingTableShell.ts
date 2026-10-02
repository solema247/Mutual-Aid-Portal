/**

 * F4/F5 list visuals aligned with User Management on `add_user`

 * (AccessRightsManagement directory panel).

 * Presentation tokens only.

 */



/** Page section spacing (matches add_user UserManagement) */

export const REPORTING_PAGE_SECTION = 'space-y-4 w-full min-w-0'

/** Summary stat cards (add_user AccessRightsManagement) */
export const REPORTING_SUMMARY_GRID =
  'grid grid-cols-2 gap-3 sm:grid-cols-4 w-full min-w-0'

/** Directory panel shell */

export const REPORTING_PANEL =

  'overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm dark:border-border/40 dark:bg-card w-full min-w-0'



/** Toolbar row inside panel (filters / search) */

export const REPORTING_PANEL_TOOLBAR =

  'flex flex-row flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-border/40'



export const REPORTING_TABLE_SCROLL = 'overflow-x-auto w-full min-w-0'



export const REPORTING_TABLE = 'w-full min-w-[1100px] text-[11px] leading-snug'



export const REPORTING_TABLE_HEADER_ROW =

  'border-b border-slate-100 bg-slate-50/60 hover:bg-slate-50/60 dark:border-border/40 dark:bg-muted/15 [&>th]:px-2.5 [&>th]:py-1.5 [&>th]:text-[10px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground [&>th]:whitespace-nowrap'



export const REPORTING_TABLE_BODY_ROW =

  'border-b border-slate-100 last:border-b-0 dark:border-border/40 [&>td]:px-2.5 [&>td]:py-1.5 [&>td]:align-middle [&>td]:text-[11px] [&>td]:leading-snug transition-colors hover:bg-slate-50/80 dark:hover:bg-muted/20'



export const REPORTING_TABLE_FOOTER =

  'flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-border/40'



export const REPORTING_SORT_BUTTON =

  'inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground'



export const REPORTING_SECTION_TITLE = 'text-sm font-semibold text-foreground shrink-0'



export const REPORTING_EMPTY =

  'space-y-1 px-4 py-8 text-center text-sm text-muted-foreground'



export const REPORTING_LOADING = 'px-4 py-8 text-center text-sm text-muted-foreground'



/** Page number strip (add_user AccessRightsManagement) */

export function buildReportingPageNumbers(

  current: number,

  total: number

): Array<number | 'ellipsis'> {

  if (total <= 7) {

    return Array.from({ length: total }, (_, i) => i + 1)

  }

  const pages: Array<number | 'ellipsis'> = [1]

  const start = Math.max(2, current - 1)

  const end = Math.min(total - 1, current + 1)

  if (start > 2) pages.push('ellipsis')

  for (let p = start; p <= end; p += 1) pages.push(p)

  if (end < total - 1) pages.push('ellipsis')

  pages.push(total)

  return pages

}


