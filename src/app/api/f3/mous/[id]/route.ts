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

    // Choose a project with non-empty descriptive fields if possible
    const pick = (projects || []).find((p: any) => (
      (p?.project_objectives && String(p.project_objectives).trim() !== '') ||
      (p?.intended_beneficiaries && String(p.intended_beneficiaries).trim() !== '') ||
      (p?.planned_activities && String(p.planned_activities).trim() !== '')
    )) || (projects || [])[0] || null
    const project = pick

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

    return NextResponse.json({ mou, project, partner })
  } catch (error) {
    console.error('Error loading MOU detail:', error)
    return NextResponse.json({ error: 'Failed to load MOU detail' }, { status: 500 })
  }
}


