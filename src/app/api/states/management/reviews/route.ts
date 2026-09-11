import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createGithubIssue } from '@/lib/githubCreateIssue'
import { checkRaiseTicketRateLimit } from '@/lib/rateLimitSlidingWindow'
import {
  DEFAULT_STATES_REVIEW_LABEL,
  DEFAULT_STATES_REVIEW_TASK_TYPE,
  GITHUB_PROJECT_TEAM_REQUESTS,
  GITHUB_STATES_REVIEW_LABELS,
  STATES_REVIEW_TASK_TYPES,
} from '@/lib/raiseTicketGithub'
import { requireStateManager } from '@/lib/stateManagement/requireStateManager'

const createReviewSchema = z.object({
  state_id: z.string().uuid(),
  comment: z.string().trim().min(10).max(2000),
  label: z.enum(GITHUB_STATES_REVIEW_LABELS).default(DEFAULT_STATES_REVIEW_LABEL),
  type_of_task: z.enum(STATES_REVIEW_TASK_TYPES).default(DEFAULT_STATES_REVIEW_TASK_TYPE),
  team_request: z.enum(GITHUB_PROJECT_TEAM_REQUESTS),
})

function isMissingReviewsTable (error: { message?: string; code?: string } | null): boolean {
  if (!error) return false
  const msg = (error.message ?? '').toLowerCase()
  return error.code === '42P01' || msg.includes('state_locality_reviews')
}

export async function POST (request: Request) {
  const auth = await requireStateManager('states_flag_review')
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createReviewSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: locality, error: localityError } = await auth.ctx.supabase
    .from('states')
    .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
    .eq('id', parsed.data.state_id)
    .maybeSingle()

  if (localityError) {
    console.error('POST /api/states/management/reviews locality:', localityError)
    return NextResponse.json({ error: 'Failed to load locality' }, { status: 500 })
  }
  if (!locality) {
    return NextResponse.json({ error: 'Locality not found' }, { status: 404 })
  }

  const { data: existingOpen, error: existingError } = await auth.ctx.supabase
    .from('state_locality_reviews')
    .select('id, github_issue_url')
    .eq('state_id', parsed.data.state_id)
    .eq('status', 'open')
    .maybeSingle()

  if (existingError && isMissingReviewsTable(existingError)) {
    return NextResponse.json(
      {
        error: 'Review storage is not set up yet. Apply sql/create_state_locality_reviews.sql in the schema repo.',
      },
      { status: 503 }
    )
  }
  if (existingError) {
    console.error('POST /api/states/management/reviews existing:', existingError)
    return NextResponse.json({ error: 'Failed to check existing reviews' }, { status: 500 })
  }
  if (existingOpen) {
    return NextResponse.json(
      {
        error: 'This locality is already marked for review.',
        review_id: existingOpen.id,
        github_issue_url: existingOpen.github_issue_url,
      },
      { status: 409 }
    )
  }

  const rate = checkRaiseTicketRateLimit(auth.ctx.dbUser.id)
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: 'Too many ticket submissions. Please try again later.',
        retryAfter: rate.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(rate.retryAfterSec) },
      }
    )
  }

  const { count: roomCount } = await auth.ctx.supabase
    .from('emergency_rooms')
    .select('id', { count: 'exact', head: true })
    .eq('state_reference', locality.id)

  const { data: userRow } = await auth.ctx.supabase
    .from('users')
    .select('display_name')
    .eq('id', auth.ctx.dbUser.id)
    .maybeSingle()

  const reporter = userRow?.display_name ?? '(unknown)'
  const localityLabel = locality.locality || '(no locality name)'
  const stateLabel = locality.state_name || '(unknown state)'
  const short = locality.state_short ? ` (${locality.state_short})` : ''

  const issueTitle = `States review: ${stateLabel} / ${localityLabel}`
  const issueBody = [
    '## States / localities review',
    '',
    `**Reporter:** ${reporter}`,
    `**State:** ${stateLabel}${short}`,
    `**Locality:** ${localityLabel}`,
    `**Locality ID:** \`${locality.id}\``,
    `**Rooms using this row:** ${roomCount ?? 0}`,
    `**Label:** ${parsed.data.label}`,
    `**Type of Task:** ${parsed.data.type_of_task}`,
    `**Team Request:** ${parsed.data.team_request}`,
    '',
    '### Comment',
    '',
    parsed.data.comment,
    '',
    '---',
    '_Submitted via ERR portal → State Management. Do not delete rooms, projects, or allocations as a side effect of this review._',
  ].join('\n')

  let github: { html_url?: string; number?: number }
  try {
    github = await createGithubIssue({
      title: issueTitle,
      body: issueBody,
      label: parsed.data.label,
      labelColor: parsed.data.label === 'state-locality-change' ? '1D76DB' : '5319E7',
      labelDescription: 'State / locality mapping review',
      typeOfTask: parsed.data.type_of_task,
      teamRequest: parsed.data.team_request,
    })
  } catch (error) {
    const status = (error as Error & { statusCode?: number }).statusCode ?? 502
    const message = error instanceof Error ? error.message : 'Could not create GitHub issue'
    console.error('POST /api/states/management/reviews github:', error)
    return NextResponse.json({ error: message }, { status })
  }

  const { data: review, error: insertError } = await auth.ctx.supabase
    .from('state_locality_reviews')
    .insert({
      state_id: locality.id,
      comment: parsed.data.comment,
      github_issue_url: github.html_url ?? null,
      github_issue_number: github.number ?? null,
      status: 'open',
      flagged_by: auth.ctx.dbUser.id,
    })
    .select('id, comment, github_issue_url, github_issue_number, flagged_at, status')
    .single()

  if (insertError) {
    console.error('POST /api/states/management/reviews insert:', insertError)
    return NextResponse.json(
      {
        error: 'GitHub ticket was created, but the portal flag could not be saved.',
        github_issue_url: github.html_url,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    review: {
      ...review,
      flagged_by_name: reporter === '(unknown)' ? null : reporter,
    },
  }, { status: 201 })
}
