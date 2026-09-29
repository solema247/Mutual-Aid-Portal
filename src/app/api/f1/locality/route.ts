import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSbRouteClient } from '@/lib/sbRoute'

const bodySchema = z.object({
  state_name: z.string().trim().min(1),
  state_name_ar: z.string().trim().nullable().optional(),
  state_short: z.string().trim().min(1).max(8),
  locality: z.string().trim().min(1).max(120),
  locality_ar: z.string().trim().max(120).nullable().optional(),
})

/** POST /api/f1/locality — create a locality row (states) via paired route client */
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
    const { data: created, error } = await supabase
      .from('states')
      .insert({
        state_name: v.state_name,
        state_name_ar: v.state_name_ar?.trim() || null,
        locality: v.locality,
        locality_ar: v.locality_ar?.trim() || null,
        state_short: v.state_short,
      })
      .select('id, state_name, state_name_ar, state_short, locality, locality_ar')
      .single()

    if (error) {
      console.error('POST /api/f1/locality:', error)
      return NextResponse.json({ error: error.message || 'Failed to create locality' }, { status: 500 })
    }

    return NextResponse.json({ locality: created }, { status: 201 })
  } catch (e) {
    console.error('POST /api/f1/locality:', e)
    return NextResponse.json({ error: 'Failed to create locality' }, { status: 500 })
  }
}
