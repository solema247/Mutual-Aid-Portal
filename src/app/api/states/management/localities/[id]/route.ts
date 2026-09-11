import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStateManager } from '@/lib/stateManagement/requireStateManager'

const patchSchema = z.object({
  locality_ar: z.string().trim().max(80).nullable(),
})

export async function PATCH (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStateManager('states_edit_labels')
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Missing locality id' }, { status: 400 })
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
    .from('states')
    .select('id')
    .eq('id', id)
    .maybeSingle()

  if (existingError) {
    console.error('PATCH /api/states/management/localities/[id] lookup:', existingError)
    return NextResponse.json({ error: 'Failed to load locality' }, { status: 500 })
  }
  if (!existing) {
    return NextResponse.json({ error: 'Locality not found' }, { status: 404 })
  }

  const { data: updated, error: updateError } = await auth.ctx.supabase
    .from('states')
    .update({ locality_ar: parsed.data.locality_ar?.trim() || null })
    .eq('id', id)
    .select('id, locality, locality_ar')
    .single()

  if (updateError) {
    console.error('PATCH /api/states/management/localities/[id]:', updateError)
    return NextResponse.json({ error: 'Failed to update locality' }, { status: 500 })
  }

  return NextResponse.json({ locality: updated })
}
