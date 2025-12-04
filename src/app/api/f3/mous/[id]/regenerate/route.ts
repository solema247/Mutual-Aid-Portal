import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { aggregateObjectives, aggregateBeneficiaries, aggregatePlannedActivities, aggregatePlannedActivitiesDetailed, aggregateLocations, getBankingDetails } from '@/lib/mou-aggregation'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const id = params.id
    const { data: mou, error: mouErr } = await supabase.from('mous').select('*').eq('id', id).single()
    if (mouErr || !mou) throw mouErr || new Error('MOU not found')

    // Load all projects for aggregation
    const { data: projects } = await supabase
      .from('err_projects')
      .select('project_objectives, intended_beneficiaries, planned_activities, planned_activities_resolved, locality, state, banking_details')
      .eq('mou_id', id)
    
    // Aggregate data from all projects
    const aggregated = {
      objectives: aggregateObjectives(projects || []),
      beneficiaries: aggregateBeneficiaries(projects || []),
      activities: aggregatePlannedActivities(projects || []),
      activitiesDetailed: aggregatePlannedActivitiesDetailed(projects || []),
      locations: aggregateLocations(projects || []),
      banking: getBankingDetails(projects || [])
    }

    const total = Number(mou.total_amount || 0)
    const endDate = mou.end_date as string | null

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
  <style>body{font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.5}h2{font-size:16px;margin:16px 0 8px}.section{border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin:12px 0}.row{display:table;width:100%;table-layout:fixed}.col{display:table-cell;vertical-align:top;width:50%;padding:8px}.box{border:1px solid #e5e7eb;border-radius:6px;padding:8px}ul{margin:4px 0;padding-left:18px}.rtl{direction:rtl}.muted{color:#6b7280;font-size:12px}.meta{margin-bottom:8px}</style>
  <title>${mou.mou_code}</title><meta name=Generator content="Word HTML" /></head><body>
  <div class="meta">
    <div><strong>MOU Code:</strong> ${mou.mou_code}</div>
    <div><strong>Partner:</strong> ${mou.partner_name}</div>
    <div><strong>ERR:</strong> ${mou.err_name}</div>
    <div><strong>State:</strong> ${mou.state || ''}</div>
    <div><strong>Total:</strong> ${total.toLocaleString()}</div>
  </div>
  <div class="section"><h2>1. Purpose</h2>
    <div>This MOU will guide the partnership between ${mou.partner_name} and ${mou.err_name} to support the community and provide for the humanitarian needs of people affected by the ongoing conflict in Sudan.</div>
    <div class="muted">This will be accomplished by undertaking the following activities:</div>
    <div class="row">
      <div class="col"><div class="box"><div style="font-weight:600;margin-bottom:6px;">${mou.err_name} shall</div>
      ${aggregated.objectives ? `<div><strong>Objectives</strong><div>${String(aggregated.objectives).replace(/\n/g,'<br/>')}</div></div>` : ''}
      ${aggregated.beneficiaries ? `<div style="margin-top:6px;"><strong>Target Beneficiaries</strong><div>${String(aggregated.beneficiaries).replace(/\n/g,'<br/>')}</div></div>` : ''}
      ${(aggregated.activitiesDetailed || aggregated.activities) ? `<div style="margin-top:6px;"><strong>Planned Activities</strong><div>${String(aggregated.activitiesDetailed || aggregated.activities).replace(/\n/g,'<br/>')}</div></div>` : ''}
      ${(aggregated.locations.localities || aggregated.locations.state) ? `<div class=muted style=margin-top:6px;>Location: ${aggregated.locations.localities || ''} / ${aggregated.locations.state || ''}</div>` : ''}
      </div></div>
      <div class="col"><div class="box"><div style="font-weight:600;margin-bottom:6px;">${mou.partner_name} shall</div>
        <ul>
          <li>Provide a sum of $${total.toLocaleString()}.</li>
          <li>Accept applications submitted by communities that determine needs priorities (protection, WASH, food security, health, shelter/NFIs).</li>
          <li>Assess needs fairly using the community-led methodology (F1 submit).</li>
          <li>Provide technical support and ensure consistent follow-up on agreed procedures.</li>
          <li>Report to the donor.</li>
        </ul>
      </div></div>
    </div>
  </div>
  <div class="section"><h2>2. Principles of Partnership</h2>
    <div class=row><div class=col><div class=box>All parties have entered into this agreement in a spirit of cooperation, valuing the different skills, experiences, knowledge, and opinions that each party brings. All parties will support a culture where risk management is valued as essential and beneficial. The parties commit to desired outcomes and expected benefits, share and listen to new ideas, seek to use experiences to overcome challenges, and agree to regular and proactive communication with early escalation of issues.</div></div>
    <div class=col><div class="box rtl">دخلت جميع الأطراف في هذه الاتفاقية بروح التعاون، مع تقدير المهارات والخبرات والمعرفة والآراء المختلفة التي يجلبها كل طرف. ستدعم جميع الأطراف ثقافة يعتبر فيها إدارة المخاطر أمرًا أساسيًا ومفيدًا. تلتزم الأطراف بالنتائج المرجوة والفوائد المتوقعة، وتشارك الأفكار الجديدة وتستمع إليها، وتسعى للاستفادة من خبرات الأطراف الأخرى لتجاوز التحديات، وتوافق على التواصل المنتظم والاستباقي مع التصعيد المبكر للمشكلات لضمان الحل السريع.</div></div></div>
  </div>
  <div class="section"><h2>3. Reports</h2>
    <div class=row><div class=col><div class=box>The partner shall present a narrative report (F5) and a financial report (F4) after completion, sharing details of work completed, people supported, and a breakdown of costs. This must follow the F-system templates. ERR undertakes to return any funds for which accounting is not provided.</div></div>
    <div class=col><div class="box rtl">يلتزم الشريك بتقديم تقرير سردي (F5) وتقرير مالي (F4) بعد اكتمال التنفيذ، يتضمن تفاصيل الأعمال المنجزة، وعدد الأشخاص المستفيدين، وتفصيلاً للتكاليف. يجب أن يتبع ذلك نماذج نظام الـ F. وتلتزم غرفة الطوارئ بإعادة أي أموال لا يتم تقديم حسابات عنها.</div></div></div>
  </div>
  <div class="section"><h2>4. Funding</h2>
    <div class=row><div class=col><div class=box>The ${mou.partner_name} will provide a grant of $${total.toLocaleString()} upon signing this MOU. Disbursement and proof-of-payment requirements apply per policy.</div></div>
    <div class=col><div class="box rtl">سيقوم ${mou.partner_name} بتقديم منحة قدرها $${total.toLocaleString()} عند توقيع مذكرة التفاهم هذه. تنطبق متطلبات الصرف وإثبات الدفع وفق السياسات المعمول بها.</div></div></div>
  </div>
  <div class="section"><h2>5. Budget</h2>
    <div class=row><div class=col><div class=box>A detailed budget is maintained in the F1(s) linked to this MOU. Procurement procedures apply; changes or obstacles must be reported at least 24 hours in advance.</div></div>
    <div class=col><div class="box rtl">يتم الاحتفاظ بميزانية تفصيلية في نماذج F1 المرتبطة بهذه المذكرة. تُطبق إجراءات الشراء، ويجب الإبلاغ عن أي تغييرات أو عوائق قبل 24 ساعة على الأقل.</div></div></div>
  </div>
    <div class="section"><h2>6. Approved Accounts</h2>
    <div class=row><div class=col><div class=box>${mou.banking_details_override ? String(mou.banking_details_override).replace(/\n/g,'<br/>') : (aggregated.banking ? String(aggregated.banking).replace(/\n/g,'<br/>') : 'Account details as shared and approved by ERR will be used for disbursement.')}</div></div>
    <div class=col><div class="box rtl">${mou.banking_details_override ? String(mou.banking_details_override).replace(/\n/g,'<br/>') : (aggregated.banking ? String(aggregated.banking).replace(/\n/g,'<br/>') : 'تُستخدم تفاصيل الحساب المعتمدة من غرفة الطوارئ في عمليات الصرف.')}</div></div></div>
  </div>
  <div class="section"><h2>7. Duration</h2>
    <div>This MOU is effective ${mou.start_date ? `from ${mou.start_date}` : 'upon signature by authorized officials of both parties'}. ${endDate ? `It will terminate on ${endDate}.` : ''} Either party may terminate with written notification.</div>
  </div>
  <div class="section"><h2>8. Contact Information</h2>
    <div class=row>
      <div class=col><div class=box>${mou.partner_contact_override ? String(mou.partner_contact_override).replace(/\n/g,'<br/>') : `Partner: ${mou.partner_name}`}</div></div>
      <div class=col><div class=box>${mou.err_contact_override ? String(mou.err_contact_override).replace(/\n/g,'<br/>') : `ERR: ${mou.err_name}`}</div></div>
    </div>
  </div>
  </body></html>`

    const filePath = `f3-mous/${mou.id}/${mou.mou_code}.doc`
    const blob = new Blob([html], { type: 'application/msword' })
    const { error: upErr } = await supabase.storage.from('images').upload(filePath, blob, { upsert: true })
    if (upErr) throw upErr
    await supabase.from('mous').update({ file_key: filePath }).eq('id', mou.id)

    return NextResponse.json({ success: true, file_key: filePath })
  } catch (error) {
    console.error('Error regenerating MOU file:', error)
    return NextResponse.json({ error: 'Failed to regenerate document' }, { status: 500 })
  }
}


