export type LocalityReview = {
  id: string
  comment: string
  github_issue_url: string | null
  github_issue_number: number | null
  flagged_at: string
  flagged_by_name: string | null
}

export type LocalityRow = {
  id: string
  locality: string | null
  locality_ar: string | null
  room_count: number
  project_count: number
  review: LocalityReview | null
}

export type StateGroup = {
  state_name: string
  state_name_ar: string | null
  state_short: string | null
  locality_count: number
  room_count: number
  project_count: number
  review_count: number
  localities: LocalityRow[]
}
