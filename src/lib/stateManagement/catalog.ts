import type { SupabaseClient } from '@supabase/supabase-js'
import type { LocalityReview, StateGroup } from '@/lib/stateManagement/types'

type StateRow = {
  id: string
  state_name: string | null
  state_name_ar: string | null
  state_short: string | null
  locality: string | null
  locality_ar: string | null
}

type ReviewRow = {
  id: string
  state_id: string
  comment: string
  github_issue_url: string | null
  github_issue_number: number | null
  flagged_at: string
  flagged_by: string | null
}

function isMissingReviewsTable (error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return error.code === '42P01' || msg.includes('state_locality_reviews')
}

const PAGE_SIZE = 1000

async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string; code?: string } | null }>
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function loadStateCatalog (supabase: SupabaseClient): Promise<StateGroup[]> {
  const rows = await fetchAllPages<StateRow>((from, to) =>
    supabase
      .from('states')
      .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
      .order('state_name')
      .order('locality')
      .order('id', { ascending: true })
      .range(from, to)
  )

  const [rooms, projects, reviewsResult] = await Promise.all([
    fetchAllPages<{ state_reference?: string | null }>((from, to) =>
      supabase
        .from('emergency_rooms')
        .select('state_reference')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<{ state?: string | null; locality?: string | null }>((from, to) =>
      supabase
        .from('err_projects')
        .select('state, locality')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<ReviewRow>((from, to) =>
      supabase
        .from('state_locality_reviews')
        .select('id, state_id, comment, github_issue_url, github_issue_number, flagged_at, flagged_by')
        .eq('status', 'open')
        .order('id', { ascending: true })
        .range(from, to)
    ).catch((err: { message?: string; code?: string }) => {
      if (isMissingReviewsTable(err)) return [] as ReviewRow[]
      throw err
    }),
  ])

  const reviews = reviewsResult

  const roomCounts = new Map<string, number>()
  for (const room of rooms) {
    const id = room.state_reference
    if (!id) continue
    roomCounts.set(id, (roomCounts.get(id) ?? 0) + 1)
  }

  const projectCounts = new Map<string, number>()
  for (const project of projects) {
    const state = String(project.state ?? '').trim()
    const locality = String(project.locality ?? '').trim()
    const key = `${state.toLowerCase()}|${locality.toLowerCase()}`
    projectCounts.set(key, (projectCounts.get(key) ?? 0) + 1)
  }

  const flaggedByIds = [...new Set(reviews.map((r) => r.flagged_by).filter((id): id is string => !!id))]
  const nameByUserId = new Map<string, string>()
  if (flaggedByIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, display_name')
      .in('id', flaggedByIds)
    for (const user of users ?? []) {
      const row = user as { id: string; display_name: string | null }
      if (row.display_name) nameByUserId.set(row.id, row.display_name)
    }
  }

  const reviewByStateId = new Map<string, LocalityReview>()
  for (const review of reviews) {
    reviewByStateId.set(review.state_id, {
      id: review.id,
      comment: review.comment,
      github_issue_url: review.github_issue_url,
      github_issue_number: review.github_issue_number,
      flagged_at: review.flagged_at,
      flagged_by_name: review.flagged_by ? (nameByUserId.get(review.flagged_by) ?? null) : null,
    })
  }

  const groups = new Map<string, StateGroup>()
  for (const row of rows) {
    const stateName = (row.state_name ?? '').trim()
    if (!stateName) continue

    const roomCount = roomCounts.get(row.id) ?? 0
    const projectKey = `${stateName.toLowerCase()}|${(row.locality ?? '').trim().toLowerCase()}`
    const projectCount = projectCounts.get(projectKey) ?? 0
    const review = reviewByStateId.get(row.id) ?? null

    let group = groups.get(stateName)
    if (!group) {
      group = {
        state_name: stateName,
        state_name_ar: row.state_name_ar,
        state_short: row.state_short,
        locality_count: 0,
        room_count: 0,
        project_count: 0,
        review_count: 0,
        localities: [],
      }
      groups.set(stateName, group)
    } else {
      if (!group.state_name_ar && row.state_name_ar) group.state_name_ar = row.state_name_ar
      if (!group.state_short && row.state_short) group.state_short = row.state_short
    }

    group.localities.push({
      id: row.id,
      locality: row.locality,
      locality_ar: row.locality_ar,
      room_count: roomCount,
      project_count: projectCount,
      review,
    })
    group.locality_count += 1
    group.room_count += roomCount
    group.project_count += projectCount
    if (review) group.review_count += 1
  }

  return Array.from(groups.values())
}
