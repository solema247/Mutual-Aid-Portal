import { NextResponse } from 'next/server'
import { requireCanvasSession } from '@/lib/canvas/session'
import { FULL_PORTAL_MOUNT_CODES } from '@/lib/canvas/types'

export async function GET() {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { supabase, canvas } = session

  if (canvas.is_fallback) {
    return NextResponse.json({
      mounts: FULL_PORTAL_MOUNT_CODES.map((code, i) => ({
        code,
        name: code,
        description: null,
        nav_group: null,
        route_href: null,
        sort_order: i,
      })),
      templates: [
        {
          code: 'full_portal',
          name: 'Full portal (all modules)',
          description:
            'Fallback catalog — apply sql/canvas scripts so templates load from the database.',
          mount_codes: [...FULL_PORTAL_MOUNT_CODES],
        },
      ],
      canvas_is_fallback: true,
    })
  }

  const [{ data: mounts, error: mountsErr }, { data: templates, error: templatesErr }] =
    await Promise.all([
      supabase
        .from('mount_catalog')
        .select('code, name, description, nav_group, route_href, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('workflow_templates')
        .select('code, name, description, mount_codes')
        .eq('is_active', true)
        .order('code', { ascending: true }),
    ])

  if (mountsErr || templatesErr) {
    console.error('[canvas/catalog]', mountsErr || templatesErr)
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 })
  }

  return NextResponse.json({
    mounts: mounts ?? [],
    templates: templates ?? [],
    canvas_is_fallback: false,
  })
}
