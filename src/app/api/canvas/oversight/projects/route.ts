import { NextResponse } from 'next/server'
import { requireCanvasSession } from '@/lib/canvas/session'
import {
  isCoordinatorOrg,
  listOversightProjectsForCoordinator,
} from '@/lib/canvas/disclosure'

export async function GET() {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { canvas, supabase } = session

  if (canvas.is_fallback) {
    return NextResponse.json({
      projects: [],
      canvas_is_fallback: true,
      disclosure_unavailable: true,
    })
  }

  if (!isCoordinatorOrg(canvas.organization)) {
    return NextResponse.json(
      { error: 'Forbidden — coordinator organization required', code: 'NOT_COORDINATOR' },
      { status: 403 }
    )
  }

  try {
    const { rows, unavailable } = await listOversightProjectsForCoordinator(
      supabase,
      canvas.organization.id
    )
    return NextResponse.json({
      projects: rows,
      canvas_is_fallback: false,
      disclosure_unavailable: unavailable,
    })
  } catch (e) {
    console.error('GET /api/canvas/oversight/projects', e)
    return NextResponse.json({
      projects: [],
      canvas_is_fallback: false,
      disclosure_unavailable: true,
    })
  }
}
