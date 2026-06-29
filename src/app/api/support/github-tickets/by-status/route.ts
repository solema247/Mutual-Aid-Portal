import { NextResponse } from 'next/server'
import { z } from 'zod'
import { buildBigRockChartData, resolveGithubProjectRef } from '@/lib/githubProjectApi'
import {
  GITHUB_PROJECT_BIG_ROCKS,
  GITHUB_PROJECT_SYSTEM_ENHANCEMENTS,
  STATUS_SERIES,
  type GithubProjectBigRock,
} from '@/lib/raiseTicketGithub'
import { assertPermission, getRouteHandlerAuth } from '@/lib/routeHandlerAuth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const querySchema = z.object({
  bigRock: z.enum(GITHUB_PROJECT_BIG_ROCKS).default(GITHUB_PROJECT_SYSTEM_ENHANCEMENTS),
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
      bigRock: searchParams.get('bigRock') ?? GITHUB_PROJECT_SYSTEM_ENHANCEMENTS,
    })
    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedQuery.error.flatten() },
        { status: 400 }
      )
    }

    const bigRock: GithubProjectBigRock = parsedQuery.data.bigRock
    const project = resolveGithubProjectRef()
    const chartData = await buildBigRockChartData(token, bigRock, project)

    const total = chartData.reduce(
      (sum, row) =>
        sum + STATUS_SERIES.reduce((rowSum, key) => rowSum + row[key], 0),
      0
    )

    return NextResponse.json({
      chartData,
      series: STATUS_SERIES,
      total,
      bigRock,
      project,
    })
  } catch (e) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('GET /api/support/github-tickets/by-status:', e)
    const detail = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: 'Could not load GitHub ticket stats', detail }, { status: 502 })
  }
}
