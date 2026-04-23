import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { normalizeF1DateForDb } from '@/lib/f1WorkplanNormalize'
import { f1WorkplanCreateSchema } from '@/lib/f1WorkplanSchema'

function emptyToNull<T extends string | null | undefined> (v: T): string | null {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export async function POST (request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = f1WorkplanCreateSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const v = parsed.data

    const { data: room, error: roomErr } = await supabase
      .from('emergency_rooms')
      .select(`
        id,
        err_code,
        status,
        state:states!emergency_rooms_state_reference_fkey(state_name)
      `)
      .eq('id', v.emergency_room_id)
      .maybeSingle()

    if (roomErr || !room) {
      return NextResponse.json({ error: 'Emergency room not found' }, { status: 400 })
    }

    if (room.status !== 'active') {
      return NextResponse.json({ error: 'Emergency room is not active' }, { status: 400 })
    }

    const st = room.state as { state_name?: string } | { state_name?: string }[] | null | undefined
    const stateName =
      Array.isArray(st) ? st[0]?.state_name ?? null : st?.state_name ?? null

    const grantSegment =
      v.grant_segment === undefined || v.grant_segment === null
        ? null
        : String(v.grant_segment)

    const dbDate = normalizeF1DateForDb(emptyToNull(v.date) ?? undefined)

    const localityClean = emptyToNull(v.locality)

    const row = {
      date: dbDate,
      state: stateName,
      locality: localityClean,
      project_objectives: emptyToNull(v.project_objectives),
      intended_beneficiaries: emptyToNull(v.intended_beneficiaries),
      estimated_beneficiaries: v.estimated_beneficiaries ?? null,
      estimated_timeframe: emptyToNull(v.estimated_timeframe),
      additional_support: emptyToNull(v.additional_support),
      banking_details: emptyToNull(v.banking_details),
      program_officer_name: emptyToNull(v.program_officer_name),
      program_officer_phone: emptyToNull(v.program_officer_phone),
      reporting_officer_name: emptyToNull(v.reporting_officer_name),
      reporting_officer_phone: emptyToNull(v.reporting_officer_phone),
      finance_officer_name: emptyToNull(v.finance_officer_name),
      finance_officer_phone: emptyToNull(v.finance_officer_phone),
      planned_activities: v.planned_activities,
      expenses: v.expenses,
      emergency_room_id: v.emergency_room_id,
      err_id: emptyToNull(room.err_code),
      status: 'pending',
      source: 'mutual_aid_portal',
      project_name: localityClean,
      temp_file_key: v.temp_file_key ?? null,
      original_text: v.original_text ?? null,
      language: v.language || 'en',
      grant_segment: grantSegment,
      ocr_edited_fields_count:
        v.mode === 'ocr' ? (v.ocr_edited_fields_count ?? null) : null
    }

    const { data: inserted, error: insertError } = await supabase
      .from('err_projects')
      .insert([row])
      .select('id')
      .single()

    if (insertError) {
      console.error('f1/workplan insert:', insertError)
      const msg = insertError.message?.includes('grant_segment')
        ? 'Invalid grant segment'
        : insertError.message || 'Insert failed'
      const status =
        insertError.code === '23503' || insertError.code === '23514' ? 400 : 500
      return NextResponse.json({ error: msg }, { status })
    }

    return NextResponse.json({ success: true, id: inserted?.id })
  } catch (e) {
    console.error('POST /api/f1/workplan:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
