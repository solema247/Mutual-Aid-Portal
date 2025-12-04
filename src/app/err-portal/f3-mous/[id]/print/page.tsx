'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { aggregateObjectives, aggregateBeneficiaries, aggregatePlannedActivities, aggregatePlannedActivitiesDetailed, aggregateLocations, getBankingDetails } from '@/lib/mou-aggregation'

export default function PrintMOUPage() {
  const params = useParams() as { id: string }
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/f3/mous/${params.id}`)
      const json = await res.json()
      setData(json)
    }
    load()
  }, [params.id])

  if (!data) return <div className="p-6">Loading…</div>
  const { mou, projects, project, partner } = data
  
  // Use projects array if available, otherwise fall back to single project
  const projectList = projects || (project ? [project] : [])
  const aggregated = useMemo(() => ({
    objectives: aggregateObjectives(projectList),
    beneficiaries: aggregateBeneficiaries(projectList),
    activities: aggregatePlannedActivities(projectList),
    activitiesDetailed: aggregatePlannedActivitiesDetailed(projectList),
    locations: aggregateLocations(projectList),
    banking: getBankingDetails(projectList)
  }), [projectList])

  return (
    <div className="p-6 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          .no-print { display: none !important; }
          .page { break-inside: avoid; }
        }
      `}</style>
      <div className="no-print mb-4 text-sm text-muted-foreground">Generating PDF… Use browser Print to Save as PDF.</div>
      <div className="space-y-4">
        <div className="text-sm">
          <div><strong>MOU Code:</strong> {mou.mou_code}</div>
          <div><strong>Partner:</strong> {mou.partner_name}</div>
          <div><strong>ERR:</strong> {mou.err_name}</div>
          <div><strong>State:</strong> {mou.state || ''}</div>
          <div><strong>Total:</strong> {Number(mou.total_amount || 0).toLocaleString()}</div>
        </div>

        <Section title="1. Purpose">
          <p className="text-sm">This MOU will guide the partnership between {mou.partner_name} and {mou.err_name} to support the community and provide for the humanitarian needs of people affected by the ongoing conflict in Sudan.</p>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <Box>
              <div className="font-medium mb-1">{mou.err_name} shall</div>
              {aggregated.objectives && (
                <div className="mb-1">
                  <div className="font-semibold">Objectives</div>
                  <div className="whitespace-pre-wrap">{aggregated.objectives}</div>
                </div>
              )}
              {aggregated.beneficiaries && (
                <div className="mb-1">
                  <div className="font-semibold">Target Beneficiaries</div>
                  <div className="whitespace-pre-wrap">{aggregated.beneficiaries}</div>
                </div>
              )}
              {(aggregated.activitiesDetailed || aggregated.activities) && (
                <div className="mb-1">
                  <div className="font-semibold">Planned Activities</div>
                  <div className="whitespace-pre-wrap">{aggregated.activitiesDetailed || aggregated.activities}</div>
                </div>
              )}
              {(aggregated.locations.localities || aggregated.locations.state) && (
                <div className="mb-1 text-xs text-muted-foreground">
                  Location: {aggregated.locations.localities || '-'} / {aggregated.locations.state || '-'}
                </div>
              )}
            </Box>
            <Box>
              <div className="font-medium mb-1">{mou.partner_name} shall</div>
              <ul className="list-disc list-inside text-sm">
                <li>Provide a sum of ${Number(mou.total_amount || 0).toLocaleString()}.</li>
                <li>Accept community applications (protection, WASH, food security, health, shelter/NFIs).</li>
                <li>Assess needs fairly via F1 method.</li>
                <li>Provide technical support and follow-up.</li>
                <li>Report to the donor.</li>
              </ul>
            </Box>
          </div>
        </Section>

        <TwoCol title="2. Principles of Partnership" left="All parties have entered into this agreement in a spirit of cooperation, valuing the different skills, experiences, knowledge, and opinions that each party brings. All parties will support a culture where risk management is valued as essential and beneficial. The parties commit to desired outcomes and expected benefits, share and listen to new ideas, seek to use experiences to overcome challenges, and agree to regular and proactive communication with early escalation of issues." right="دخلت جميع الأطراف في هذه الاتفاقية بروح التعاون، مع تقدير المهارات والخبرات والمعرفة والآراء المختلفة التي يجلبها كل طرف. ستدعم جميع الأطراف ثقافة يعتبر فيها إدارة المخاطر أمرًا أساسيًا ومفيدًا. تلتزم الأطراف بالنتائج المرجوة والفوائد المتوقعة، وتشارك الأفكار الجديدة وتستمع إليها، وتسعى للاستفادة من خبرات الأطراف الأخرى لتجاوز التحديات، وتوافق على التواصل المنتظم والاستباقي مع التصعيد المبكر للمشكلات لضمان الحل السريع." />

        <TwoCol title="3. Reports" left="The partner shall present a narrative report (F5) and a financial report (F4) after completion, sharing details of work completed, people supported, and a breakdown of costs. This must follow the F-system templates. ERR undertakes to return any funds for which accounting is not provided." right="يلتزم الشريك بتقديم تقرير سردي (F5) وتقرير مالي (F4) بعد اكتمال التنفيذ، يتضمن تفاصيل الأعمال المنجزة، وعدد الأشخاص المستفيدين، وتفصيلاً للتكاليف. يجب أن يتبع ذلك نماذج نظام الـ F. وتلتزم غرفة الطوارئ بإعادة أي أموال لا يتم تقديم حسابات عنها." />

        <TwoCol title="4. Funding" left={`The ${mou.partner_name} will provide a grant of $${Number(mou.total_amount || 0).toLocaleString()} upon signing this MOU. Disbursement and proof-of-payment requirements apply per policy.`} right={`سيقوم ${mou.partner_name} بتقديم منحة قدرها $${Number(mou.total_amount || 0).toLocaleString()} عند توقيع مذكرة التفاهم هذه. تنطبق متطلبات الصرف وإثبات الدفع وفق السياسات المعمول بها.`} />

        <TwoCol title="5. Budget" left="A detailed budget is maintained in the F1(s) linked to this MOU. Procurement procedures apply; changes or obstacles must be reported at least 24 hours in advance." right="يتم الاحتفاظ بميزانية تفصيلية في نماذج F1 المرتبطة بهذه المذكرة. تُطبق إجراءات الشراء، ويجب الإبلاغ عن أي تغييرات أو عوائق قبل 24 ساعة على الأقل." />

        <TwoCol title="6. Approved Accounts" left={aggregated.banking || 'Account details as shared and approved by ERR will be used for disbursement.'} right={aggregated.banking || 'تُستخدم تفاصيل الحساب المعتمدة من غرفة الطوارئ في عمليات الصرف.'} preWrap />
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="page border rounded-lg p-4">
      <div className="font-semibold mb-2">{title}</div>
      {children}
    </div>
  )
}

function TwoCol({ title, left, right, preWrap }: { title: string; left: string; right: string; preWrap?: boolean }) {
  return (
    <div className="page border rounded-lg p-4">
      <div className="font-semibold mb-2">{title}</div>
      <div className="grid grid-cols-2 gap-4">
        <Box>{preWrap ? <pre className="whitespace-pre-wrap text-sm">{left}</pre> : <div className="text-sm">{left}</div>}</Box>
        <Box rtl>{preWrap ? <pre className="whitespace-pre-wrap text-sm">{right}</pre> : <div className="text-sm">{right}</div>}</Box>
      </div>
    </div>
  )
}

function Box({ children, rtl }: { children: any; rtl?: boolean }) {
  return (
    <div className={`border rounded-md p-3 ${rtl ? 'text-right' : ''}`} dir={rtl ? 'rtl' : 'ltr'}>
      {children}
    </div>
  )
}


