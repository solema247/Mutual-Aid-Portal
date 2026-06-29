import { NextResponse } from 'next/server'
import { z } from 'zod'
import { countProjectItemsByBigRock, resolveGithubProjectRef } from '@/lib/githubProjectApi'
import {
  DEFAULT_TICKET_STATUS_FILTER,
  GITHUB_PROJECT_BIG_ROCK_CHART_ORDER,
  bigRockChartColor,
  type TicketStatusFilter,
  type TicketsByBigRockChartRow,
} from '@/lib/raiseTicketGithub'
import { assertPermission, getRouteHandlerAuth } from '@/lib/routeHandlerAuth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const querySchema = z.object({
  status: z.enum(['open', 'closed']).default(DEFAULT_TICKET_STATUS_FILTER),
})

export async function GET (request: Request) {
  try {
    const auth = await getRouteHandlerAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userRow, error: userErr } = await auth.supabase
      .from('users')
      .select('status')
      .eq('id', auth.dbUser.id)
      .single()

    if (userErr || !userRow || userRow.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    assertPermission(auth, 'raise_ticket_page')

    const token = process.env.GITHUB_ISSUES_TOKEN ?? process.env.GITHUB_TOKEN
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub integration is not configured on this server.' },
        { status: 503 }
      )
    }

    const { searchParams } = new URL(request.url)
    const parsedQuery = querySchema.safeParse({
      status: searchParams.get('status') ?? DEFAULT_TICKET_STATUS_FILTER,
    })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedQuery.error.flatten() },
        { status: 400 }
      )
    }

    const statusFilter: TicketStatusFilter = parsedQuery.data.status
    const project = resolveGithubProjectRef()
    const counts = await countProjectItemsByBigRock(token, statusFilter, project)

    const chartData: TicketsByBigRockChartRow[] = GITHUB_PROJECT_BIG_ROCK_CHART_ORDER.map(
      (bigRock, index) => ({
        bigRock,
        count: counts[bigRock],
        fill: bigRockChartColor(index),
      })
    )

    const total = chartData.reduce((sum, row) => sum + row.count, 0)

    return NextResponse.json({
      chartData,
      total,
      statusFilter,
      project,
      field: process.env.GITHUB_PROJECT_BIG_ROCK_FIELD ?? 'Big Rock',
    })
  } catch (e) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('GET /api/support/github-tickets/by-type:', e)
    const detail = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: 'Could not load GitHub ticket stats', detail }, { status: 502 })
  }
}
