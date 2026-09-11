import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStateManager } from '@/lib/stateManagement/requireStateManager'

const patchSchema = z.object({
  status: z.literal('cleared'),
})

export async function PATCH (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStateManager('states_flag_review')
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing review id' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: existing, error: existingError } = await auth.ctx.supabase
    .from('state_locality_reviews')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (existingError) {
    console.error('PATCH /api/states/management/reviews/[id] lookup:', existingError)
    return NextResponse.json({ error: 'Failed to load review' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }
  if (existing.status === 'cleared') {
    return NextResponse.json({ ok: true })
  }

  const { error: updateError } = await auth.ctx.supabase
    .from('state_locality_reviews')
    .update({
      status: 'cleared',
      cleared_by: auth.ctx.dbUser.id,
      cleared_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    console.error('PATCH /api/states/management/reviews/[id]:', updateError)
    return NextResponse.json({ error: 'Failed to clear review' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
