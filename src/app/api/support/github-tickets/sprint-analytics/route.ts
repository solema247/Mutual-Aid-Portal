import { NextResponse } from 'next/server'
import { fetchSprintAnalytics, resolveGithubProjectRef } from '@/lib/githubProjectApi'
import { assertPermission, getRouteHandlerAuth } from '@/lib/routeHandlerAuth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET () {
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

    const project = resolveGithubProjectRef()
    const analytics = await fetchSprintAnalytics(token, project)

    return NextResponse.json({ analytics, project })
  } catch (e) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('GET /api/support/github-tickets/sprint-analytics:', e)
    const detail = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json(
      { error: 'Could not load sprint analytics', detail },
      { status: 502 }
    )
  }
}
