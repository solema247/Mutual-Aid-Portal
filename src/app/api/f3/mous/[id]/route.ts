import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess, userCanAccessState } from '@/lib/userStateAccess'
import { requirePermission } from '@/lib/requirePermission'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const id = params.id
    // Load MOU
    const { data: mou, error: mouErr } = await supabase
      .from('mous')
      .select('*')
      .eq('id', id)
      .single()
    if (mouErr) throw mouErr
    const canAccess = await userCanAccessState((mou as any)?.state)
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to this MOU' }, { status: 403 })
    }

    // Load linked projects to pull banking/contact fields; prefer ones with rich details
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select(`
        id,
        language,
        banking_details,
        program_officer_name,
        program_officer_phone,
        reporting_officer_name,
        reporting_officer_phone,
        finance_officer_name,
        finance_officer_phone,
        project_objectives,
        intended_beneficiaries,
        estimated_beneficiaries,
        planned_activities,
        locality,
        state,
        expenses,
        err_id,
        emergency_room_id,
        grant_id,
        emergency_rooms (name, name_ar, err_code),
        "Sector (Primary)",
        "Sector (Secondary)"
      `)
      .eq('mou_id', id)
      .order('submitted_at', { ascending: false })
    if (projErr) throw projErr

    // Resolve planned activities for all projects
    const resolvedProjects = [] as any[]
    for (const p of (projects || [])) {
      let resolved: any = { ...p }
      if (p?.planned_activities) {
        try {
          const raw = typeof p.planned_activities === 'string' ? JSON.parse(p.planned_activities) : p.planned_activities
          const arr = Array.isArray(raw) ? raw : []
          const ids = Array.from(new Set(arr.map((a: any) => a?.selectedActivity).filter(Boolean)))
          if (ids.length > 0) {
            const { data: activities } = await supabase
              .from('planned_activities')
              .select('id, activity_name, language')
              .in('id', ids as string[])
            const nameMap: Record<string, string> = {}
            for (const a of (activities || [])) nameMap[a.id] = a.activity_name || a.id
            const names = arr.map((a: any) => nameMap[a?.selectedActivity] || a?.selectedActivity || '').filter(Boolean)
            resolved.planned_activities_resolved = names.join('\n')
          }
        } catch {}
      }
      resolvedProjects.push(resolved)
    }

    // Try resolve partner by name
    let partner = null as any
    if (mou?.partner_name) {
      const { data: partnerRow } = await supabase
        .from('partners')
        .select('id, name, contact_person, email, phone_number, address, position')
        .ilike('name', mou.partner_name)
        .limit(1)
        .maybeSingle()
      partner = partnerRow
    }

    // Parse signatures JSON if it exists
    if (mou && (mou as any).signatures && typeof (mou as any).signatures === 'string') {
      try {
        (mou as any).signatures = JSON.parse((mou as any).signatures)
      } catch (e: unknown) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('Failed to parse signatures JSON:', e)
        }
        (mou as any).signatures = null
      }
    }

    return NextResponse.json({ mou, projects: resolvedProjects, partner })
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('Error loading MOU detail:', error)
    }
    return NextResponse.json({ error: 'Failed to load MOU detail' }, { status: 500 })
  }
}

// PATCH /api/f3/mous/[id] - update MOU editable fields
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('f3_edit_mou')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const id = params.id
    const body = await request.json()

    const { data: existingMou, error: fetchErr } = await supabase
      .from('mous')
      .select('id, state')
      .eq('id', id)
      .single()
    if (fetchErr || !existingMou) {
      return NextResponse.json({ error: 'MOU not found' }, { status: 404 })
    }
    const canAccess = await userCanAccessState((existingMou as any).state)
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to this MOU' }, { status: 403 })
    }

    // Only allow updating specific editable fields
    const allowedFields = [
      'partner_name',
      'err_name',
      'start_date',
      'end_date',
      'banking_details_override',
      'partner_contact_override',
      'err_contact_override',
      'partner_signature',
      'err_signature',
      'signature_date',
      'signatures'
    ]

    const updates: any = {}
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'signatures') {
          // Handle signatures as JSON array
          if (Array.isArray(body[field]) && body[field].length > 0) {
            try {
              updates[field] = JSON.stringify(body[field])
            } catch (e: unknown) {
              if (typeof console !== 'undefined' && console.error) {
                console.error('Error stringifying signatures:', e)
              }
              return NextResponse.json(
                { error: 'Failed to serialize signatures data' },
                { status: 400 }
              )
            }
          } else {
            updates[field] = null
          }
        } else {
          updates[field] = body[field] === '' ? null : body[field]
        }
      }
    }

    // Update the MOU
    const { data: updated, error: updateErr } = await supabase
      .from('mous')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (updateErr) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('Error updating MOU:', updateErr)
      }
      return NextResponse.json(
        { error: 'Failed to update MOU', details: updateErr.message },
        { status: 500 }
      )
    }

    // Parse signatures JSON if it exists
    if (updated && (updated as any).signatures && typeof (updated as any).signatures === 'string') {
      try {
        (updated as any).signatures = JSON.parse((updated as any).signatures)
      } catch (e: unknown) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('Failed to parse signatures JSON in response:', e)
        }
        (updated as any).signatures = null
      }
    }

    return NextResponse.json(updated)
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('Error updating MOU:', error)
    }
    return NextResponse.json({ error: 'Failed to update MOU' }, { status: 500 })
  }
}

// DELETE /api/f3/mous/[id] - Remove MOU and unlink F1s (F1s remain as committed, only mou_id cleared)
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('f3_remove_mou')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const id = params.id
    if (!id) {
      return NextResponse.json({ error: 'MOU ID is required' }, { status: 400 })
    }

    const { allowedStateNames } = await getUserStateAccess()

    const { data: mou, error: mouErr } = await supabase
      .from('mous')
      .select('id, state')
      .eq('id', id)
      .single()

    if (mouErr || !mou) {
      return NextResponse.json({ error: 'MOU not found' }, { status: 404 })
    }

    if (allowedStateNames !== null && allowedStateNames.length > 0 && mou.state) {
      if (!allowedStateNames.includes(mou.state)) {
        return NextResponse.json({ error: 'Not allowed to remove this MOU' }, { status: 403 })
      }
    }

    // Unlink all F1s: set mou_id = null so projects remain but are no longer part of this MOU
    const { error: unlinkErr } = await supabase
      .from('err_projects')
      .update({ mou_id: null })
      .eq('mou_id', id)

    if (unlinkErr) {
      console.error('Error unlinking projects from MOU:', unlinkErr)
      return NextResponse.json(
        { error: 'Failed to unlink projects from MOU' },
        { status: 500 }
      )
    }

    // Delete the MOU record
    const { error: deleteErr } = await supabase
      .from('mous')
      .delete()
      .eq('id', id)

    if (deleteErr) {
      console.error('Error deleting MOU:', deleteErr)
      return NextResponse.json({ error: 'Failed to delete MOU' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing MOU:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove MOU' },
      { status: 500 }
    )
  }
}
