import { NextResponse } from 'next/server'
import {
  assertPermission,
  getRouteHandlerAuth,
  isErrSubmissionSource
} from '@/lib/routeHandlerAuth'
import { isApprovedUnassigned } from '../_shared'
import { z } from 'zod'

const bodySchema = z.object({
  project_ids: z.array(z.string().uuid()).min(1).max(500)
}).strict()

export async function POST (request: Request) {
  try {
    const auth = await getRouteHandlerAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    assertPermission(auth, 'f1_stage')

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const ids = [...new Set(parsed.data.project_ids)]

    const { data: rows, error: fetchErr } = await auth.supabase
      .from('err_projects')
      .select('id, source, status, funding_status')
      .in('id', ids)

    if (fetchErr || !rows || rows.length !== ids.length) {
      return NextResponse.json(
        { error: 'One or more projects not found or inaccessible' },
        { status: 400 }
      )
    }

    for (const row of rows) {
      if (!isErrSubmissionSource(row.source as string | null)) {
        return NextResponse.json(
          { error: 'Invalid project source in selection' },
          { status: 400 }
        )
      }
      if (!isApprovedUnassigned(row)) {
        return NextResponse.json(
          {
            error:
              'All projects must be approved with unassigned funding before moving to F2'
          },
          { status: 400 }
        )
      }
    }

    const { error: updError } = await auth.supabase
      .from('err_projects')
      .update({ status: 'pending' })
      .in('id', ids)

    if (updError) {
      console.error(updError)
      return NextResponse.json({ error: 'Failed to update projects' }, { status: 500 })
    }

    return NextResponse.json({ success: true, updated: ids.length })
  } catch (e: unknown) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('POST /api/f1/err/move-to-f2:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
