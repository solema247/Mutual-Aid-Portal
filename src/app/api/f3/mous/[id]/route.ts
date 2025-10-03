import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id
    // Load MOU
    const { data: mou, error: mouErr } = await supabase
      .from('mous')
      .select('*')
      .eq('id', id)
      .single()
    if (mouErr) throw mouErr

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
        planned_activities,
        locality,
        state,
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

    return NextResponse.json({ mou, projects: resolvedProjects, partner })
  } catch (error) {
    console.error('Error loading MOU detail:', error)
    return NextResponse.json({ error: 'Failed to load MOU detail' }, { status: 500 })
  }
}


