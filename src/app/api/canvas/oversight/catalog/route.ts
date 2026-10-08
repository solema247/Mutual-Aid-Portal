import { NextResponse } from 'next/server'
import { requireCanvasSession } from '@/lib/canvas/session'
import {
  isCoordinatorOrg,
  listOversightCatalogForCoordinator,
} from '@/lib/canvas/disclosure'

export async function GET() {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { canvas, supabase } = session

  if (canvas.is_fallback) {
    return NextResponse.json({
      processors: [],
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
    const { processors, unavailable } = await listOversightCatalogForCoordinator(
      supabase,
      canvas.organization.id
    )
    return NextResponse.json({
      processors,
      canvas_is_fallback: false,
      disclosure_unavailable: unavailable,
    })
  } catch (e) {
    console.error('GET /api/canvas/oversight/catalog', e)
    return NextResponse.json({
      processors: [],
      canvas_is_fallback: false,
      disclosure_unavailable: true,
    })
  }
}
