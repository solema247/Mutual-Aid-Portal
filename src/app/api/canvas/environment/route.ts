import { NextResponse } from 'next/server'
import { requireCanvasSession } from '@/lib/canvas/session'

export async function GET() {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { canvas } = session
  return NextResponse.json({
    organization: canvas.organization,
    environment: canvas.environment,
    mounted_modules: canvas.mounted_modules,
    canvas_is_fallback: canvas.is_fallback,
  })
}
