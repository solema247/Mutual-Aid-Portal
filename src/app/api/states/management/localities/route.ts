import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireStateManager } from '@/lib/stateManagement/requireStateManager'

const createLocalitySchema = z.object({
  state_name: z.string().trim().min(1).max(80),
  locality: z.string().trim().min(1).max(80),
  locality_ar: z.string().trim().max(80).optional().nullable(),
})

export async function POST (request: Request) {
  const auth = await requireStateManager('states_create_locality')
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createLocalitySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const { data: parentRows, error: parentError } = await auth.ctx.supabase
    .from('states')
    .select('id, state_name, state_name_ar, state_short, locality')
    .eq('state_name', parsed.data.state_name)

  if (parentError) {
    console.error('POST /api/states/management/localities parent:', parentError)
    return NextResponse.json({ error: 'Failed to load state' }, { status: 500 })
  }

  const parent = parentRows?.[0]
  if (!parent) {
    return NextResponse.json({ error: 'State not found' }, { status: 404 })
  }

  const localityName = parsed.data.locality
  const duplicate = parentRows?.some(
    (row) => (row.locality ?? '').trim().toLowerCase() === localityName.toLowerCase()
  )
  if (duplicate) {
    return NextResponse.json({ error: 'This locality already exists in the state.' }, { status: 409 })
  }

  const { data: created, error: insertError } = await auth.ctx.supabase
    .from('states')
    .insert({
      state_name: parent.state_name,
      state_name_ar: parent.state_name_ar,
      state_short: parent.state_short,
      locality: localityName,
      locality_ar: parsed.data.locality_ar?.trim() || null,
    })
    .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
    .single()

  if (insertError) {
    console.error('POST /api/states/management/localities insert:', insertError)
    return NextResponse.json({ error: 'Failed to create locality' }, { status: 500 })
  }

  return NextResponse.json({ locality: created }, { status: 201 })
}
