import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSbRouteClient } from '@/lib/sbRoute'

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  name_ar: z.string().trim().max(200).nullable().optional(),
  state_name: z.string().trim().min(1),
  state_short: z.string().trim().min(1).max(8).nullable().optional(),
  /** Preferred: exact states.id for this locality */
  state_reference: z.string().uuid().optional(),
  locality: z.string().trim().min(1).optional(),
})

/** POST /api/f1/room — create an emergency room via paired route client */
export async function POST(request: Request) {
  try {
    const supabase = createSbRouteClient()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const v = parsed.data

    let stateReference = v.state_reference || null
    let stateShort = (v.state_short || 'XX').toUpperCase()

    if (!stateReference && v.locality) {
      const { data: stateRow } = await supabase
        .from('states')
        .select('id, state_short')
        .eq('state_name', v.state_name)
        .eq('locality', v.locality)
        .maybeSingle()
      if (stateRow?.id) {
        stateReference = stateRow.id
        if (stateRow.state_short) stateShort = String(stateRow.state_short).toUpperCase()
      }
    }

    if (!stateReference) {
      return NextResponse.json(
        { error: 'state_reference or matching state_name+locality is required' },
        { status: 400 }
      )
    }

    const { data: allStateIds, error: allStateIdsError } = await supabase
      .from('states')
      .select('id')
      .eq('state_name', v.state_name)
    if (allStateIdsError) {
      return NextResponse.json({ error: allStateIdsError.message }, { status: 500 })
    }

    const stateIds = (allStateIds || []).map((s: { id: string }) => s.id)
    let roomNumber = '01'
    if (stateIds.length > 0) {
      const { data: existingRooms } = await supabase
        .from('emergency_rooms')
        .select('err_code')
        .in('state_reference', stateIds)
        .not('err_code', 'is', null)

      if (existingRooms?.length) {
        const numbers = existingRooms
          .map((room: { err_code?: string | null }) => {
            const match = room.err_code?.match(/ERR-[A-Z0-9]+-(\d+)-\d+/i)
            return match ? parseInt(match[1], 10) : 0
          })
          .filter((n: number) => !Number.isNaN(n))
        if (numbers.length > 0) {
          roomNumber = String(Math.max(...numbers) + 1).padStart(2, '0')
        }
      }
    }

    const uniqueId = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    const errCode = `ERR-${stateShort}-${roomNumber}-${uniqueId}`

    const { data: newRoom, error: createError } = await supabase
      .from('emergency_rooms')
      .insert({
        name: v.name,
        name_ar: v.name_ar?.trim() || null,
        state_reference: stateReference,
        type: 'base',
        status: 'active',
        err_code: errCode,
      })
      .select('*')
      .single()

    if (createError) {
      console.error('POST /api/f1/room:', createError)
      return NextResponse.json({ error: createError.message || 'Failed to create room' }, { status: 500 })
    }

    return NextResponse.json({ room: newRoom }, { status: 201 })
  } catch (e) {
    console.error('POST /api/f1/room:', e)
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }
}
