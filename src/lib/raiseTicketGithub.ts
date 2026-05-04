/** Allowed issue labels in solema247/Mutual-Aid-Portal (must match GitHub). */
export const GITHUB_RAISE_TICKET_LABELS = [
  'bug',
  'portal-ui-major-fix',
  'portal-ui-minor-fix',
] as const

export type GithubRaiseTicketLabel = (typeof GITHUB_RAISE_TICKET_LABELS)[number]

export const RAISE_TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const

export type RaiseTicketPriority = (typeof RAISE_TICKET_PRIORITIES)[number]

/** Inserted into GitHub issue description when portal sends priority. */
export const PRIORITY_TO_DESCRIPTION_LINE: Record<RaiseTicketPriority, string> = {
  P0: 'P0 – Urgent',
  P1: 'P1 – Must Have',
  P2: 'P2 – Good to Have',
  P3: 'P3 – Unsure',
}
