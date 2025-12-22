'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { aggregateObjectives, aggregateBeneficiaries, aggregatePlannedActivities, aggregatePlannedActivitiesDetailed, aggregateLocations, getBankingDetails, getBudgetTable } from '@/lib/mou-aggregation'

interface Signature {
  id: string
  name: string
  role?: string
  date: string
}

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
  
  // Parse signatures JSON if it exists
  let signatures: Signature[] = []
  if ((mou as any).signatures) {
    try {
      signatures = typeof (mou as any).signatures === 'string' 
        ? JSON.parse((mou as any).signatures) 
        : (mou as any).signatures
    } catch (e) {
      console.error('Failed to parse signatures JSON:', e)
      signatures = []
    }
  }
  
  // Use projects array if available, otherwise fall back to single project
  const projectList = projects || (project ? [project] : [])
  const aggregated = useMemo(() => ({
    objectives: aggregateObjectives(projectList),
    beneficiaries: aggregateBeneficiaries(projectList),
    activities: aggregatePlannedActivities(projectList),
    activitiesDetailed: aggregatePlannedActivitiesDetailed(projectList),
    locations: aggregateLocations(projectList),
    banking: getBankingDetails(projectList),
    budgetTable: getBudgetTable(projectList)
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

        <TwoCol title="5. Approved Accounts" left={aggregated.banking || 'Account details as shared and approved by ERR will be used for disbursement.'} right={aggregated.banking || 'تُستخدم تفاصيل الحساب المعتمدة من غرفة الطوارئ في عمليات الصرف.'} preWrap />

        <Section title="6. Budget">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Box>
              <div className="text-sm">A detailed budget is maintained in the F1(s) linked to this MOU. Procurement procedures apply; changes or obstacles must be reported at least 24 hours in advance.</div>
            </Box>
            <Box rtl>
              <div className="text-sm">يتم الاحتفاظ بميزانية تفصيلية في نماذج F1 المرتبطة بهذه المذكرة. تُطبق إجراءات الشراء، ويجب الإبلاغ عن أي تغييرات أو عوائق قبل 24 ساعة على الأقل.</div>
            </Box>
          </div>
          {aggregated.budgetTable && (
            <div className="mt-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: aggregated.budgetTable }} />
          )}
        </Section>

        <Section title="7. Duration">
          <div className="text-sm">
            This MOU is effective {mou.start_date ? `from ${mou.start_date}` : 'upon signature by authorized officials of both parties'}. {mou.end_date ? `It will terminate on ${mou.end_date}.` : ''} Either party may terminate with written notification.
          </div>
        </Section>

        <Section title="8. Contact Information">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Box>
              <div className="font-medium mb-1">Partner</div>
              <div className="text-sm">{mou.partner_contact_override || `Partner: ${mou.partner_name}`}</div>
            </Box>
            <Box>
              <div className="font-medium mb-1">ERR</div>
              <div className="text-sm">{mou.err_contact_override || `ERR: ${mou.err_name}`}</div>
            </Box>
          </div>
          {signatures.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
              {signatures.map((sig, idx) => (
                <div key={sig.id || idx} className="space-y-2">
                  <div className="font-medium text-sm">{sig.name || `Signature ${idx + 1}`}{sig.role ? ` (${sig.role})` : ''}</div>
                  <div className="border-b-2 border-gray-400 min-h-[40px] pb-2">
                    <span className="text-muted-foreground text-sm">Signature line</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Date: {sig.date ? new Date(sig.date).toLocaleDateString() : 'Not set'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
              <div>
                <div className="font-medium mb-2 text-sm">Partner Signature</div>
                <div className="border-b-2 border-gray-400 min-h-[50px] pb-1">
                  {mou.partner_signature || <span className="text-muted-foreground text-sm">Signature</span>}
                </div>
              </div>
              <div>
                <div className="font-medium mb-2 text-sm">ERR Signature</div>
                <div className="border-b-2 border-gray-400 min-h-[50px] pb-1">
                  {mou.err_signature || <span className="text-muted-foreground text-sm">Signature</span>}
                </div>
              </div>
              <div>
                <div className="font-medium mb-2 text-sm">Date of Signature</div>
                <div className="border-b-2 border-gray-400 min-h-[50px] pb-1">
                  {mou.signature_date ? new Date(mou.signature_date).toLocaleDateString() : <span className="text-muted-foreground text-sm">Date</span>}
                </div>
              </div>
            </div>
          )}
        </Section>
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


