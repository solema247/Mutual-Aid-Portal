import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStateManager } from '@/lib/stateManagement/requireStateManager'

const patchSchema = z.object({
  state_name: z.string().trim().min(1).max(80),
  state_name_ar: z.string().trim().min(1).max(80),
})

export async function PATCH (request: Request) {
  const auth = await requireStateManager('states_edit_labels')
  if (!auth.ok) return auth.response

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
    .eq('state_name', parsed.data.state_name)
    .limit(1)

  if (existingError) {
    console.error('PATCH /api/states/management/state-arabic lookup:', existingError)
    return NextResponse.json({ error: 'Failed to load state' }, { status: 500 })
  }
  if (!existing?.length) {
    return NextResponse.json({ error: 'State not found' }, { status: 404 })
  }

  const { error: updateError } = await auth.ctx.supabase
    .from('states')
    .update({ state_name_ar: parsed.data.state_name_ar })
    .eq('state_name', parsed.data.state_name)

  if (updateError) {
    console.error('PATCH /api/states/management/state-arabic:', updateError)
    return NextResponse.json({ error: 'Failed to update Arabic state name' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
