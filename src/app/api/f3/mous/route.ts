import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/f3/mous - list MOUs (simple)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const state = searchParams.get('state')

    let query = supabase
      .from('mous')
      .select('*')
      .order('created_at', { ascending: false })

    if (search) {
      // Client-side filter after fetch for simplicity
      const { data, error } = await query
      if (error) throw error
      const s = search.toLowerCase()
      const filtered = (data || []).filter((m: any) =>
        m.mou_code?.toLowerCase().includes(s) ||
        m.partner_name?.toLowerCase().includes(s) ||
        m.err_name?.toLowerCase().includes(s)
      )
      return NextResponse.json(filtered)
    }

    if (state) {
      query = query.eq('state', state)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error listing MOUs:', error)
    return NextResponse.json({ error: 'Failed to list MOUs' }, { status: 500 })
  }
}

// POST /api/f3/mous - create an MOU and link committed projects
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { project_ids, mou_code, end_date, partner_name, partner_id, err_name, state } = body || {}

    if (!Array.isArray(project_ids) || project_ids.length === 0) {
      return NextResponse.json({ error: 'project_ids is required' }, { status: 400 })
    }

    // Fetch projects and validate committed + not already linked
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select('id, expenses, status, funding_status, mou_id, state, emergency_room_id, emergency_rooms (name, name_ar)')
      .in('id', project_ids)

    if (projErr) throw projErr
    if (!projects || projects.length !== project_ids.length) {
      return NextResponse.json({ error: 'Some projects not found' }, { status: 400 })
    }

    const invalid = projects.filter((p: any) => p.funding_status !== 'committed' || p.status !== 'approved')
    if (invalid.length > 0) {
      return NextResponse.json({ error: 'All projects must be committed and approved' }, { status: 400 })
    }
    const alreadyLinked = projects.filter((p: any) => !!p.mou_id)
    if (alreadyLinked.length > 0) {
      return NextResponse.json({ error: 'Some projects already linked to an MOU', project_ids: alreadyLinked.map((p: any) => p.id) }, { status: 400 })
    }

    // Compute total amount
    const sumExpenses = (exp: any): number => {
      const arr = typeof exp === 'string' ? JSON.parse(exp || '[]') : (Array.isArray(exp) ? exp : [])
      return arr.reduce((s: number, e: any) => s + (e?.total_cost || 0), 0)
    }
    const total_amount = projects.reduce((s: number, p: any) => s + sumExpenses(p.expenses), 0)

    // Infer defaults if not provided
    const inferredState = state || projects[0]?.state || null
    const inferredErrName = err_name || projects[0]?.emergency_rooms?.name || projects[0]?.emergency_rooms?.name_ar || `${inferredState || ''} Emergency Room`
    let inferredPartner = partner_name || 'Localization Hub'

    // If partner_id provided, resolve partner_name from partners table
    if (partner_id) {
      const { data: partnerRow, error: partnerErr } = await supabase
        .from('partners')
        .select('id, name, status')
        .eq('id', partner_id)
        .single()
      if (partnerErr) throw partnerErr
      if (!partnerRow || partnerRow.status !== 'active') {
        return NextResponse.json({ error: 'Invalid partner selected' }, { status: 400 })
      }
      inferredPartner = partnerRow.name
    }

    // Generate a code if none provided
    const partnerPrefix = (inferredPartner || 'Localization Hub').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4) || 'LHUB'
    const statePrefix = (inferredState || 'GEN').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3)
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '')
    const rand = Math.floor(100 + Math.random() * 900) // 3 digits
    const autoCode = `${partnerPrefix}-${statePrefix}-${datePart}-${rand}`

    // Create MOU row
    const { data: inserted, error: insErr } = await supabase
      .from('mous')
      .insert({
        mou_code: mou_code || autoCode,
        partner_name: inferredPartner,
        err_name: inferredErrName,
        state: inferredState,
        total_amount,
        end_date: end_date || null,
        file_key: null
      })
      .select('*')
      .single()

    if (insErr) throw insErr

    // Link projects to the MOU
    const { error: linkErr } = await supabase
      .from('err_projects')
      .update({ mou_id: inserted.id })
      .in('id', project_ids)

    if (linkErr) throw linkErr

    // Minimal document generation: create a simple text blob and upload as .docx placeholder
    try {
      const docContent = [
        'Memorandum of Understanding Agreement',
        '',
        'Between',
        `${inserted.partner_name}`,
        'And',
        `${inserted.err_name}`,
        '',
        '1. Purpose',
        `This MOU will guide the partnership between ${inserted.partner_name} and ${inserted.err_name} to support the community and provide for the humanitarian needs of people affected by the ongoing conflict in Sudan.`,
        'This will be accomplished by undertaking the following activities:',
        `${inserted.err_name} / ${inserted.partner_name} shall:`,
        '- Provide medical treatment for volunteers and their families.',
        '- Meet the medical needs of the volunteers.',
        '- The target beneficiaries are volunteers and their families.',
        `- Provide a sum of $${Number(total_amount || 0).toLocaleString()}.`,
        '- Accept applications submitted by communities and assess needs fairly, following the community-led methodology (F1 submit).',
        '- Provide technical support and ensure consistent follow-up on the agreed procedures.',
        '- Report to the donor.',
        '',
        '2. Principles of Partnership',
        'All parties have entered into this agreement in a spirit of cooperation, valuing the different skills, experiences, knowledge, and opinions that each party brings. All parties will support a culture where risk management is valued as essential and beneficial, critical for long-term project success. The parties commit to desired outcomes and expected benefits, share and listen to new ideas, seek to use experiences to overcome challenges, and agree to regular and proactive communication with early escalation of issues.',
        '',
        '3. Reports',
        'The partner shall present a narrative report (F5) and a financial report (F4) after completion, sharing details of work completed, people supported, and a breakdown of costs. This must follow the F-system templates. ERR undertakes to return any funds for which accounting is not provided.',
        '',
        '4. Funding',
        `The ${inserted.partner_name} will provide a grant of $${Number(total_amount || 0).toLocaleString()} upon signing this MOU. Micro-grant funding will be disbursed to ERR-approved central accounts, with no more than $6,000 per account authorized in one F1. Proof of payment and acknowledgment of receipt must be shared within one week. In case of delay, a clear justification must be attached to the F4 report. Small grants will be distributed to ERR sub-accounts with no more than $6,000 per F1 request.`,
        '',
        '5. Budget',
        'The budget to support the ERR will follow sound procurement procedures. Any changes or obstacles must be reported at least 24 hours in advance.',
        '',
        '6. Approved Accounts',
        'Account details as approved by ERR will be used for disbursement.',
        '',
        '7. Duration',
        `This MOU is effective upon signature by authorized officials of both parties. ${end_date ? `It will terminate on ${end_date}.` : ''} Either party may terminate with written notification.`,
        '',
        '8. Contact Information',
        `Partner: ${inserted.partner_name}`,
        `ERR: ${inserted.err_name}`,
      ].join('\n')
      const filePath = `f3-mous/${inserted.id}/${inserted.mou_code}.docx`
      const blob = new Blob([docContent], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      // Supabase storage upload via fetch is not available server-side; use storage API
      const { error: upErr } = await supabase.storage.from('images').upload(filePath, blob, { upsert: true })
      if (!upErr) {
        await supabase.from('mous').update({ file_key: filePath }).eq('id', inserted.id)
      }
    } catch (e) {
      console.warn('MOU file upload failed (placeholder)', e)
    }

    return NextResponse.json({ success: true, mou: inserted })
  } catch (error) {
    console.error('Error creating MOU:', error)
    return NextResponse.json({ error: 'Failed to create MOU' }, { status: 500 })
  }
}


