import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { aggregateObjectives, aggregateBeneficiaries, aggregatePlannedActivities, aggregatePlannedActivitiesDetailed, aggregateLocations, getBankingDetails } from '@/lib/mou-aggregation'

// GET /api/f3/mous - list MOUs (simple)
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
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
    const supabase = getSupabaseRouteClient()
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
    const inferredErrName = err_name || projects[0]?.emergency_rooms?.[0]?.name || projects[0]?.emergency_rooms?.[0]?.name_ar || `${inferredState || ''} Emergency Room`
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

    // Link projects to the MOU (status remains 'approved' until grant assignment)
    const { error: linkErr } = await supabase
      .from('err_projects')
      .update({ mou_id: inserted.id })
      .in('id', project_ids)

    if (linkErr) throw linkErr

    // Generate a styled Word-compatible HTML document (.doc) and upload
    try {
      // Load all linked projects for aggregation
      const { data: projects } = await supabase
        .from('err_projects')
        .select('project_objectives, intended_beneficiaries, planned_activities, planned_activities_resolved, locality, state, banking_details')
        .eq('mou_id', inserted.id)
      
      // Aggregate data from all projects
      const aggregated = {
        objectives: aggregateObjectives(projects || []),
        beneficiaries: aggregateBeneficiaries(projects || []),
        activities: aggregatePlannedActivities(projects || []),
        activitiesDetailed: aggregatePlannedActivitiesDetailed(projects || []),
        locations: aggregateLocations(projects || []),
        banking: getBankingDetails(projects || [])
      }

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.5; }
    h1 { font-size: 20px; margin: 0 0 8px; }
    h2 { font-size: 16px; margin: 16px 0 8px; }
    .section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 12px 0; }
    .row { display: table; width: 100%; table-layout: fixed; }
    .col { display: table-cell; vertical-align: top; width: 50%; padding: 8px; }
    .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; }
    ul { margin: 4px 0; padding-left: 18px; }
    .rtl { direction: rtl; }
    .muted { color: #6b7280; font-size: 12px; }
    .meta { margin-bottom: 8px; }
  </style>
  <title>${inserted.mou_code}</title>
  <meta name=Generator content="Word HTML" />
</head>
<body>
  <div class="meta">
    <div><strong>MOU Code:</strong> ${inserted.mou_code}</div>
    <div><strong>Partner:</strong> ${inserted.partner_name}</div>
    <div><strong>ERR:</strong> ${inserted.err_name}</div>
    <div><strong>State:</strong> ${inserted.state || ''}</div>
    <div><strong>Total:</strong> ${Number(total_amount || 0).toLocaleString()}</div>
  </div>

  <div class="section">
    <h2>1. Purpose</h2>
    <div>This MOU will guide the partnership between ${inserted.partner_name} and ${inserted.err_name} to support the community and provide for the humanitarian needs of people affected by the ongoing conflict in Sudan.</div>
    <div class="muted">This will be accomplished by undertaking the following activities:</div>
    <div class="row">
      <div class="col">
        <div class="box">
          <div style="font-weight:600; margin-bottom:6px;">${inserted.err_name} shall</div>
          ${aggregated.objectives ? `<div><strong>Objectives</strong><div>${String(aggregated.objectives).replace(/\n/g,'<br/>')}</div></div>` : ''}
          ${aggregated.beneficiaries ? `<div style="margin-top:6px;"><strong>Target Beneficiaries</strong><div>${String(aggregated.beneficiaries).replace(/\n/g,'<br/>')}</div></div>` : ''}
          ${(aggregated.activitiesDetailed || aggregated.activities) ? `<div style="margin-top:6px;"><strong>Planned Activities</strong><div>${String(aggregated.activitiesDetailed || aggregated.activities).replace(/\n/g,'<br/>')}</div></div>` : ''}
          ${(aggregated.locations.localities || aggregated.locations.state) ? `<div class="muted" style="margin-top:6px;">Location: ${aggregated.locations.localities || ''} / ${aggregated.locations.state || ''}</div>` : ''}
          ${inserted.start_date ? `<div class="muted" style="margin-top:6px;">Start Date: ${inserted.start_date}</div>` : ''}
        </div>
      </div>
      <div class="col">
        <div class="box">
          <div style="font-weight:600; margin-bottom:6px;">${inserted.partner_name} shall</div>
          <ul>
            <li>Provide a sum of $${Number(total_amount || 0).toLocaleString()}.</li>
            <li>Accept applications submitted by communities that determine needs priorities (protection, WASH, food security, health, shelter/NFIs).</li>
            <li>Assess needs fairly using the community-led methodology (F1 submit).</li>
            <li>Provide technical support and ensure consistent follow-up on agreed procedures.</li>
            <li>Report to the donor.</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>2. Principles of Partnership</h2>
    <div class="row">
      <div class="col"><div class="box">All parties have entered into this agreement in a spirit of cooperation, valuing the different skills, experiences, knowledge, and opinions that each party brings. All parties will support a culture where risk management is valued as essential and beneficial. The parties commit to desired outcomes and expected benefits, share and listen to new ideas, seek to use experiences to overcome challenges, and agree to regular and proactive communication with early escalation of issues.</div></div>
      <div class="col"><div class="box rtl">دخلت جميع الأطراف في هذه الاتفاقية بروح التعاون، مع تقدير المهارات والخبرات والمعرفة والآراء المختلفة التي يجلبها كل طرف. ستدعم جميع الأطراف ثقافة يعتبر فيها إدارة المخاطر أمرًا أساسيًا ومفيدًا. تلتزم الأطراف بالنتائج المرجوة والفوائد المتوقعة، وتشارك الأفكار الجديدة وتستمع إليها، وتسعى للاستفادة من خبرات الأطراف الأخرى لتجاوز التحديات، وتوافق على التواصل المنتظم والاستباقي مع التصعيد المبكر للمشكلات لضمان الحل السريع.</div></div>
    </div>
  </div>

  <div class="section">
    <h2>3. Reports</h2>
    <div class="row">
      <div class="col"><div class="box">The partner shall present a narrative report (F5) and a financial report (F4) after completion, sharing details of work completed, people supported, and a breakdown of costs. This must follow the F-system templates. ERR undertakes to return any funds for which accounting is not provided.</div></div>
      <div class="col"><div class="box rtl">يلتزم الشريك بتقديم تقرير سردي (F5) وتقرير مالي (F4) بعد اكتمال التنفيذ، يتضمن تفاصيل الأعمال المنجزة، وعدد الأشخاص المستفيدين، وتفصيلاً للتكاليف. يجب أن يتبع ذلك نماذج نظام الـ F. وتلتزم غرفة الطوارئ بإعادة أي أموال لا يتم تقديم حسابات عنها.</div></div>
    </div>
  </div>

  <div class="section">
    <h2>4. Funding</h2>
    <div class="row">
      <div class="col"><div class="box">The ${inserted.partner_name} will provide a grant of $${Number(total_amount || 0).toLocaleString()} upon signing this MOU. Disbursement and proof-of-payment requirements apply per policy.</div></div>
      <div class="col"><div class="box rtl">سيقوم ${inserted.partner_name} بتقديم منحة قدرها $${Number(total_amount || 0).toLocaleString()} عند توقيع مذكرة التفاهم هذه. تنطبق متطلبات الصرف وإثبات الدفع وفق السياسات المعمول بها.</div></div>
    </div>
  </div>

  <div class="section">
    <h2>5. Budget</h2>
    <div class="row">
      <div class="col"><div class="box">A detailed budget is maintained in the F1(s) linked to this MOU. Procurement procedures apply; changes or obstacles must be reported at least 24 hours in advance.</div></div>
      <div class="col"><div class="box rtl">يتم الاحتفاظ بميزانية تفصيلية في نماذج F1 المرتبطة بهذه المذكرة. تُطبق إجراءات الشراء، ويجب الإبلاغ عن أي تغييرات أو عوائق قبل 24 ساعة على الأقل.</div></div>
    </div>
  </div>

  <div class="section">
    <h2>6. Approved Accounts</h2>
    <div class="row">
      <div class="col"><div class="box">${inserted.banking_details_override ? String(inserted.banking_details_override).replace(/\n/g,'<br/>') : (aggregated.banking ? String(aggregated.banking).replace(/\n/g,'<br/>') : 'Account details as shared and approved by ERR will be used for disbursement.')}</div></div>
      <div class="col"><div class="box rtl">${inserted.banking_details_override ? String(inserted.banking_details_override).replace(/\n/g,'<br/>') : (aggregated.banking ? String(aggregated.banking).replace(/\n/g,'<br/>') : 'تُستخدم تفاصيل الحساب المعتمدة من غرفة الطوارئ في عمليات الصرف.')}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>7. Duration</h2>
    <div>This MOU is effective ${inserted.start_date ? `from ${inserted.start_date}` : 'upon signature by authorized officials of both parties'}. ${end_date ? `It will terminate on ${end_date}.` : ''} Either party may terminate with written notification.</div>
  </div>

  <div class="section">
    <h2>8. Contact Information</h2>
    <div class="row">
      <div class="col"><div class="box">${inserted.partner_contact_override ? String(inserted.partner_contact_override).replace(/\n/g,'<br/>') : `Partner: ${inserted.partner_name}`}</div></div>
      <div class="col"><div class="box">${inserted.err_contact_override ? String(inserted.err_contact_override).replace(/\n/g,'<br/>') : `ERR: ${inserted.err_name}`}</div></div>
    </div>
  </div>

</body>
</html>`

      const filePath = `f3-mous/${inserted.id}/${inserted.mou_code}.html`
      
      // Generate styled HTML
      const { generateMouPdf } = await import('./pdf-generator')
      const styledHtml = generateMouPdf(html)
      
      // Upload HTML file
      const { error: upErr } = await supabase.storage
        .from('images')
        .upload(filePath, styledHtml, { 
          contentType: 'text/html',
          upsert: true 
        })
      
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


