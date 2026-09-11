import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loadStateCatalog } from '@/lib/stateManagement/catalog'
import { requireStateManager } from '@/lib/stateManagement/requireStateManager'

export async function GET () {
  const auth = await requireStateManager('states_view_page')
  if (!auth.ok) return auth.response

  try {
    const states = await loadStateCatalog(auth.ctx.supabase)
    return NextResponse.json({ states })
  } catch (error) {
    console.error('GET /api/states/management:', error)
    return NextResponse.json({ error: 'Failed to load states' }, { status: 500 })
  }
}

const createStateSchema = z.object({
  state_name: z.string().trim().min(2).max(80),
  state_name_ar: z.string().trim().min(1).max(80),
  state_short: z.string().trim().min(2).max(4),
  locality: z.string().trim().max(80).optional().nullable(),
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

  const parsed = createStateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
  }

  const stateName = parsed.data.state_name
  const stateShort = parsed.data.state_short.trim().toUpperCase()
  if (!/^[A-Z0-9]{2,4}$/.test(stateShort)) {
    return NextResponse.json(
      { error: 'State short code must be 2–4 letters or numbers (e.g. KH).' },
      { status: 400 }
    )
  }

  const [{ data: byName, error: nameError }, { data: byShort, error: shortError }] = await Promise.all([
    auth.ctx.supabase.from('states').select('id').ilike('state_name', stateName).limit(1),
    auth.ctx.supabase.from('states').select('id').ilike('state_short', stateShort).limit(1),
  ])

  if (nameError || shortError) {
    console.error('POST /api/states/management existing check:', nameError || shortError)
    return NextResponse.json({ error: 'Failed to check existing states' }, { status: 500 })
  }

  const nameTaken = (byName?.length ?? 0) > 0
  const shortTaken = (byShort?.length ?? 0) > 0
  if (nameTaken) {
    return NextResponse.json({ error: 'A state with this name already exists.' }, { status: 409 })
  }
  if (shortTaken) {
    return NextResponse.json({ error: 'This short code is already in use.' }, { status: 409 })
  }

  const locality = parsed.data.locality?.trim() || null
  const localityAr = parsed.data.locality_ar?.trim() || null

  const { data: created, error: insertError } = await auth.ctx.supabase
    .from('states')
    .insert({
      state_name: stateName,
      state_name_ar: parsed.data.state_name_ar,
      state_short: stateShort,
      locality,
      locality_ar: localityAr,
    })
    .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
    .single()

  if (insertError) {
    console.error('POST /api/states/management insert:', insertError)
    return NextResponse.json({ error: 'Failed to create state' }, { status: 500 })
  }

  return NextResponse.json({ state: created }, { status: 201 })
}
