'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import dynamic from 'next/dynamic'

interface MOU {
  id: string
  mou_code: string
  partner_name: string
  err_name: string
  state: string | null
  total_amount: number
  end_date: string | null
  file_key: string | null
  created_at: string
}

interface MOUDetail {
  mou: MOU
  projects?: Array<{
    banking_details: string | null
    program_officer_name: string | null
    program_officer_phone: string | null
    reporting_officer_name: string | null
    reporting_officer_phone: string | null
    finance_officer_name: string | null
    finance_officer_phone: string | null
    project_objectives: string | null
    intended_beneficiaries: string | null
    planned_activities: string | null
    planned_activities_resolved?: string | null
    locality: string | null
    state: string | null
    "Sector (Primary)"?: string | null
    "Sector (Secondary)"?: string | null
  }> | null
  project?: {
    banking_details: string | null
    program_officer_name: string | null
    program_officer_phone: string | null
    reporting_officer_name: string | null
    reporting_officer_phone: string | null
    finance_officer_name: string | null
    finance_officer_phone: string | null
    project_objectives: string | null
    intended_beneficiaries: string | null
    planned_activities: string | null
    planned_activities_resolved?: string | null
    locality: string | null
    state: string | null
    "Sector (Primary)"?: string | null
    "Sector (Secondary)"?: string | null
  } | null
  partner?: {
    name: string
    contact_person: string | null
    email: string | null
    phone_number: string | null
    address: string | null
    position?: string | null
  } | null
}

export default function F3MOUsPage() {
  const { t } = useTranslation(['common'])
  const [mous, setMous] = useState<MOU[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeMou, setActiveMou] = useState<MOU | null>(null)
  const [detail, setDetail] = useState<MOUDetail | null>(null)
  const [translations, setTranslations] = useState<{ objectives_en?: string; beneficiaries_en?: string; activities_en?: string; objectives_ar?: string; beneficiaries_ar?: string; activities_ar?: string }>({})
  const [exporting, setExporting] = useState(false)
  const previewId = 'mou-preview-content'

  const toDisplay = (value: any): string => {
    if (value == null) return ''
    if (typeof value === 'string') return value
    try {
      if (Array.isArray(value)) {
        return value.map((item: any) => {
          if (item == null) return ''
          if (typeof item === 'string') return item
          return item.activity || item.description || item.selectedActivity || JSON.stringify(item)
        }).join('\n')
      }
      // Plain object
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  const fetchMous = async () => {
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/f3/mous${qs}`)
      const data = await res.json()
      setMous(data)
    } catch (e) {
      console.error('Failed to load MOUs', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMous()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>F3 MOUs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input placeholder="Search by code or partner" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" onClick={fetchMous}>{t('common:search') || 'Search'}</Button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('common:loading') || 'Loading...'}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MOU Code</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>ERR / State</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mous.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.mou_code}</TableCell>
                    <TableCell>{m.partner_name}</TableCell>
                    <TableCell>{m.err_name}{m.state ? ` — ${m.state}` : ''}</TableCell>
                    <TableCell className="text-right">{Number(m.total_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>{m.end_date ? new Date(m.end_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setActiveMou(m)
                          setPreviewOpen(true)
                          try {
                            const res = await fetch(`/api/f3/mous/${m.id}`)
                            const data = await res.json()
                            setDetail(data)
                            // Attempt lightweight auto-translation for project fields
                            const p0 = (data?.projects && data.projects[0]) || data?.project || {}
                            const objStr = toDisplay(p0?.project_objectives)
                            const benStr = toDisplay(p0?.intended_beneficiaries)
                            const actStr = toDisplay(p0?.planned_activities_resolved || p0?.planned_activities)
                            const hasArabic = (s?: string) => !!s && /[\u0600-\u06FF]/.test(s)

                            const translate = async (q: string, source: 'ar'|'en', target: 'ar'|'en') => {
                              try {
                                const r = await fetch('/api/translate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ q, source, target, format: 'text' })
                                })
                                const j = await r.json()
                                return j?.translatedText || q
                              } catch {
                                return q
                              }
                            }

                            const newTx: any = {}
                            if (objStr) {
                              if (hasArabic(objStr)) {
                                newTx.objectives_ar = objStr
                                newTx.objectives_en = await translate(objStr, 'ar', 'en')
                              } else {
                                newTx.objectives_en = objStr
                                newTx.objectives_ar = await translate(objStr, 'en', 'ar')
                              }
                            }
                            if (benStr) {
                              if (hasArabic(benStr)) {
                                newTx.beneficiaries_ar = benStr
                                newTx.beneficiaries_en = await translate(benStr, 'ar', 'en')
                              } else {
                                newTx.beneficiaries_en = benStr
                                newTx.beneficiaries_ar = await translate(benStr, 'en', 'ar')
                              }
                            }
                            if (actStr) {
                              if (hasArabic(actStr)) {
                                newTx.activities_ar = actStr
                                newTx.activities_en = await translate(actStr, 'ar', 'en')
                              } else {
                                newTx.activities_en = actStr
                                newTx.activities_ar = await translate(actStr, 'en', 'ar')
                              }
                            }
                            setTranslations(newTx)
                          } catch (e) {
                            console.error('Failed loading detail', e)
                          }
                        }}
                      >
                        Preview
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeMou?.mou_code || 'MOU'}</DialogTitle>
          </DialogHeader>
          {activeMou && (
            <div id={previewId} className="space-y-4">
              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="text-lg font-semibold mb-2">Memorandum of Understanding Agreement</div>
                <div className="text-sm">
                  <div className="font-medium">Between</div>
                  <div>{activeMou.partner_name}</div>
                  <div className="font-medium mt-2">And</div>
                  <div>{activeMou.err_name}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">1. Purpose</div>
                <p className="text-sm">This MOU will guide the partnership between {activeMou.partner_name} and {activeMou.err_name} to support the community and provide for the humanitarian needs of people affected by the ongoing conflict in Sudan.</p>
                <p className="text-sm mt-2">This will be accomplished by undertaking the following activities:</p>

                {/* English row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3" data-mou-subsection="true">
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{activeMou.err_name} shall</div>
                    <div className="text-sm space-y-2">
                      {(translations.objectives_en || (detail?.projects?.[0]?.project_objectives ?? detail?.project?.project_objectives)) && (
                        <div>
                          <div className="font-semibold">Objectives</div>
                          <div className="whitespace-pre-wrap">{translations.objectives_en || toDisplay(detail?.projects?.[0]?.project_objectives ?? detail?.project?.project_objectives)}</div>
                        </div>
                      )}
                      {(translations.beneficiaries_en || (detail?.projects?.[0]?.intended_beneficiaries ?? detail?.project?.intended_beneficiaries)) && (
                        <div>
                          <div className="font-semibold">Target Beneficiaries</div>
                          <div className="whitespace-pre-wrap">{translations.beneficiaries_en || toDisplay(detail?.projects?.[0]?.intended_beneficiaries ?? detail?.project?.intended_beneficiaries)}</div>
                        </div>
                      )}
                      {(translations.activities_en || (detail?.projects?.[0]?.planned_activities_resolved ?? detail?.project?.planned_activities_resolved) || (detail?.projects?.[0]?.planned_activities ?? detail?.project?.planned_activities)) && (
                        <div>
                          <div className="font-semibold">Planned Activities</div>
                          <div className="whitespace-pre-wrap">{translations.activities_en || toDisplay((detail?.projects?.[0]?.planned_activities_resolved ?? detail?.project?.planned_activities_resolved) || (detail?.projects?.[0]?.planned_activities ?? detail?.project?.planned_activities))}</div>
                        </div>
                      )}
                      {((detail?.projects?.[0]?.locality ?? detail?.project?.locality) || (detail?.projects?.[0]?.state ?? detail?.project?.state)) && (
                        <div className="text-xs text-muted-foreground">Location: {(detail?.projects?.[0]?.locality ?? detail?.project?.locality) || '-'} / {(detail?.projects?.[0]?.state ?? detail?.project?.state) || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{activeMou.partner_name} shall</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>Provide a sum of ${Number(activeMou.total_amount || 0).toLocaleString()}.</li>
                      <li>Accept applications submitted by communities that determine needs priorities (protection, WASH, food security, health, shelter/NFIs).</li>
                      <li>Assess needs fairly using the community-led methodology (F1 submit).</li>
                      <li>Provide technical support and ensure consistent follow-up on agreed procedures.</li>
                      <li>Report to the donor.</li>
                    </ul>
                  </div>
                </div>

                {/* Arabic row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" data-mou-subsection="true">
                  <div className="rounded-md border p-3" dir="rtl">
                    <div className="font-medium mb-2">تلتزم {activeMou.err_name}</div>
                    <div className="text-sm space-y-2">
                      {(translations.objectives_ar || (detail?.projects?.[0]?.project_objectives ?? detail?.project?.project_objectives)) && (
                        <div>
                          <div className="font-semibold">الأهداف</div>
                          <div className="whitespace-pre-wrap">{translations.objectives_ar || toDisplay(detail?.projects?.[0]?.project_objectives ?? detail?.project?.project_objectives)}</div>
                        </div>
                      )}
                      {(translations.beneficiaries_ar || (detail?.projects?.[0]?.intended_beneficiaries ?? detail?.project?.intended_beneficiaries)) && (
                        <div>
                          <div className="font-semibold">المستفيدون المستهدفون</div>
                          <div className="whitespace-pre-wrap">{translations.beneficiaries_ar || toDisplay(detail?.projects?.[0]?.intended_beneficiaries ?? detail?.project?.intended_beneficiaries)}</div>
                        </div>
                      )}
                      {(translations.activities_ar || (detail?.projects?.[0]?.planned_activities_resolved ?? detail?.project?.planned_activities_resolved) || (detail?.projects?.[0]?.planned_activities ?? detail?.project?.planned_activities)) && (
                        <div>
                          <div className="font-semibold">الأنشطة المخططة</div>
                          <div className="whitespace-pre-wrap">{translations.activities_ar || toDisplay((detail?.projects?.[0]?.planned_activities_resolved ?? detail?.project?.planned_activities_resolved) || (detail?.projects?.[0]?.planned_activities ?? detail?.project?.planned_activities))}</div>
                        </div>
                      )}
                      {((detail?.projects?.[0]?.locality ?? detail?.project?.locality) || (detail?.projects?.[0]?.state ?? detail?.project?.state)) && (
                        <div className="text-xs text-muted-foreground">الموقع: {(detail?.projects?.[0]?.locality ?? detail?.project?.locality) || '-'} / {(detail?.projects?.[0]?.state ?? detail?.project?.state) || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3" dir="rtl">
                    <div className="font-medium mb-2">تلتزم {activeMou.partner_name}</div>
                    <ul className="list-disc list-inside pr-5 text-sm space-y-1 break-words">
                      <li>تقديم مبلغ قدره ${Number(activeMou.total_amount || 0).toLocaleString()}.</li>
                      <li>قبول الطلبات المقدّمة من المجتمعات والتي تحدد أولويات الاحتياجات (الحماية، المياه والصرف الصحي، الأمن الغذائي، الصحة أو المأوى والمواد غير الغذائية).</li>
                      <li>تقييم الاحتياجات بشكل عادل وفق المنهجية المجتمعية (نموذج F1).</li>
                      <li>تقديم الدعم الفني والمتابعة المستمرة للإجراءات المتفق عليها.</li>
                      <li>رفع التقارير إلى المانح.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">2. Principles of Partnership</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">
                    All parties have entered into this agreement in a spirit of cooperation, valuing the different skills, experiences, knowledge, and opinions that each party brings. All parties will support a culture where risk management is valued as essential and beneficial. The parties commit to desired outcomes and expected benefits, share and listen to new ideas, seek to use experiences to overcome challenges, and agree to regular and proactive communication with early escalation of issues.
                  </div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">
                    دخلت جميع الأطراف في هذه الاتفاقية بروح التعاون، مع تقدير المهارات والخبرات والمعرفة والآراء المختلفة التي يجلبها كل طرف. ستدعم جميع الأطراف ثقافة يعتبر فيها إدارة المخاطر أمرًا أساسيًا ومفيدًا. تلتزم الأطراف بالنتائج المرجوة والفوائد المتوقعة، وتشارك الأفكار الجديدة وتستمع إليها، وتسعى للاستفادة من خبرات الأطراف الأخرى لتجاوز التحديات، وتوافق على التواصل المنتظم والاستباقي مع التصعيد المبكر للمشكلات لضمان الحل السريع.
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">3. Reports</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">
                    The partner shall present a narrative report (F5) and a financial report (F4) after completion, sharing details of work completed, people supported, and a breakdown of costs. This must follow the F-system templates. ERR undertakes to return any funds for which accounting is not provided.
                  </div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">
                    يلتزم الشريك بتقديم تقرير سردي (F5) وتقرير مالي (F4) بعد اكتمال التنفيذ، يتضمن تفاصيل الأعمال المنجزة، وعدد الأشخاص المستفيدين، وتفصيلاً للتكاليف. يجب أن يتبع ذلك نماذج نظام الـ F. وتلتزم غرفة الطوارئ بإعادة أي أموال لا يتم تقديم حسابات عنها.
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">4. Funding</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">
                    The {activeMou.partner_name} will provide a grant of ${Number(activeMou.total_amount || 0).toLocaleString()} upon signing this MOU. Disbursement and proof-of-payment requirements apply per policy.
                  </div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">
                    سيقوم {activeMou.partner_name} بتقديم منحة قدرها ${Number(activeMou.total_amount || 0).toLocaleString()} عند توقيع مذكرة التفاهم هذه. تنطبق متطلبات الصرف وإثبات الدفع وفق السياسات المعمول بها.
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">5. Budget</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">
                    A detailed budget is maintained in the F1(s) linked to this MOU. Procurement procedures apply; changes or obstacles must be reported at least 24 hours in advance.
                  </div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">
                    يتم الاحتفاظ بميزانية تفصيلية في نماذج F1 المرتبطة بهذه المذكرة. تُطبق إجراءات الشراء، ويجب الإبلاغ عن أي تغييرات أو عوائق قبل 24 ساعة على الأقل.
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">6. Approved Accounts</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">
                    {detail?.project?.banking_details || 'Account details as shared and approved by ERR will be used for disbursement.'}
                  </div>
                  <div className="rounded-md border p-3 text-sm whitespace-pre-wrap" dir="rtl">
                    {detail?.project?.banking_details || 'تُستخدم تفاصيل الحساب المعتمدة من غرفة الطوارئ في عمليات الصرف.'}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">7. Duration</div>
                <p className="text-sm">This MOU is effective upon signature by authorized officials of both parties. {activeMou.end_date ? `It will terminate on ${new Date(activeMou.end_date).toLocaleDateString()}.` : 'It remains valid unless terminated by mutual consent.'}</p>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">8. Contact Information</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium mb-1">Partner</div>
                    <div>{detail?.partner?.name || activeMou.partner_name}</div>
                    {detail?.partner?.contact_person && (
                      <div>Representative: {detail.partner.contact_person}</div>
                    )}
                    {detail?.partner?.position && (
                      <div>Position: {detail.partner.position}</div>
                    )}
                    {detail?.partner?.email && (
                      <div>Email: {detail.partner.email}</div>
                    )}
                    {detail?.partner?.phone_number && (
                      <div>Phone: {detail.partner.phone_number}</div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium mb-1">ERR</div>
                    <div>{activeMou.err_name}</div>
                    {detail?.project?.program_officer_name && (
                      <div>Representative: {detail.project.program_officer_name}</div>
                    )}
                    {detail?.project?.program_officer_phone && (
                      <div>Tel: {detail.project.program_officer_phone}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button
                  onClick={async () => {
                    try {
                      setExporting(true)
                      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
                        import('html2canvas'),
                        import('jspdf') as any
                      ])
                      const el = document.getElementById(previewId)
                      if (!el) return
                      const canvas = await html2canvas(el as HTMLElement, {
                        scale: 2,
                        useCORS: true,
                        logging: false,
                        backgroundColor: '#ffffff',
                        onclone: (doc) => {
                          const node = doc.getElementById(previewId)
                          if (node) {
                            // Force CSS variables to RGB fallbacks to avoid oklch
                            const vars = [
                              '--background','--foreground','--muted','--muted-foreground',
                              '--card','--card-foreground','--border','--input','--ring'
                            ]
                            vars.forEach(v => (node as HTMLElement).style.setProperty(v, '#111'))
                            ;(node as HTMLElement).style.color = '#111'
                          }
                          doc.querySelectorAll('.text-muted-foreground').forEach((n:any)=>{ n.style.color = '#6b7280' })
                        }
                      })
                      const imgData = canvas.toDataURL('image/png')
                      const pdf = new jsPDF('p', 'pt', 'a4')
                      const pageWidth = pdf.internal.pageSize.getWidth()
                      const pageHeight = pdf.internal.pageSize.getHeight()
                      const margin = 36 // ~0.5 inch

                      // Strategy: render each logical section to its own canvas and add per page to avoid splitting
                      const container = document.getElementById(previewId) as HTMLElement
                      const sections = Array.from(container.querySelectorAll('[data-mou-section="true"]')) as HTMLElement[]

                      let currentY = margin
                      for (const sec of sections) {
                        const secCanvas = await html2canvas(sec, {
                          scale: 2,
                          useCORS: true,
                          logging: false,
                          backgroundColor: '#ffffff',
                          onclone: (doc) => {
                            // Force RGB fallbacks to avoid unsupported oklch colors
                            const root = doc.documentElement as HTMLElement
                            const vars = [
                              '--background','--foreground','--muted','--muted-foreground',
                              '--card','--card-foreground','--border','--input','--ring',
                              '--primary','--primary-foreground','--secondary','--secondary-foreground',
                              '--accent','--accent-foreground','--popover','--popover-foreground'
                            ]
                            vars.forEach(v => root.style.setProperty(v, '#111'))
                            root.style.setProperty('--background', '#ffffff')
                            root.style.setProperty('--card', '#ffffff')
                            // Common utility classes
                            doc.querySelectorAll('[class*="text-"]').forEach((n:any)=>{ n.style.color = '#111' })
                            doc.querySelectorAll('.text-muted-foreground').forEach((n:any)=>{ n.style.color = '#6b7280' })
                            doc.querySelectorAll('[class*="bg-"]').forEach((n:any)=>{ n.style.backgroundColor = '#ffffff' })
                            // Borders
                            doc.querySelectorAll('[class*="border"]').forEach((n:any)=>{ n.style.borderColor = '#e5e7eb' })
                          }
                        })
                        const secImg = secCanvas.toDataURL('image/png')
                        const secW = secCanvas.width
                        const secH = secCanvas.height
                        const printableW = pageWidth - margin * 2
                        const ratio = printableW / secW
                        const drawW = printableW
                        let drawH = secH * ratio

                        if (currentY + drawH > pageHeight - margin) {
                          pdf.addPage()
                          currentY = margin
                        }
                        // If section still taller than a page, try rendering its subsections individually
                        if (drawH > pageHeight - margin * 2) {
                          const subs = Array.from(sec.querySelectorAll('[data-mou-subsection="true"]')) as HTMLElement[]
                          if (subs.length > 0) {
                            for (const sub of subs) {
                              const subCanvas = await html2canvas(sub, {
                                scale: 2,
                                useCORS: true,
                                logging: false,
                                backgroundColor: '#ffffff',
                                onclone: (doc) => {
                                  const root = doc.documentElement as HTMLElement
                                  const vars = [
                                    '--background','--foreground','--muted','--muted-foreground',
                                    '--card','--card-foreground','--border','--input','--ring',
                                    '--primary','--primary-foreground','--secondary','--secondary-foreground',
                                    '--accent','--accent-foreground','--popover','--popover-foreground'
                                  ]
                                  vars.forEach(v => root.style.setProperty(v, '#111'))
                                  root.style.setProperty('--background', '#ffffff')
                                  root.style.setProperty('--card', '#ffffff')
                                  doc.querySelectorAll('[class*="text-"]').forEach((n:any)=>{ n.style.color = '#111' })
                                  doc.querySelectorAll('.text-muted-foreground').forEach((n:any)=>{ n.style.color = '#6b7280' })
                                  doc.querySelectorAll('[class*="bg-"]').forEach((n:any)=>{ n.style.backgroundColor = '#ffffff' })
                                  doc.querySelectorAll('[class*="border"]').forEach((n:any)=>{ n.style.borderColor = '#e5e7eb' })
                                }
                              })
                              const subImg = subCanvas.toDataURL('image/png')
                              const subW = subCanvas.width
                              const subH = subCanvas.height
                              const subRatio = printableW / subW
                              const subDrawW = printableW
                              const subDrawH = subH * subRatio
                              if (currentY + subDrawH > pageHeight - margin) {
                                pdf.addPage()
                                currentY = margin
                              }
                              pdf.addImage(subImg, 'PNG', margin, currentY, subDrawW, subDrawH)
                              currentY += subDrawH + 8
                            }
                            continue
                          }
                        }
                        pdf.addImage(secImg, 'PNG', margin, currentY, drawW, drawH)
                        currentY += drawH + 12 // gap between sections
                      }
                      const blob = pdf.output('bloburl')
                      window.open(blob, '_blank')
                    } catch (e) {
                      console.error('PDF export failed', e)
                    } finally {
                      setExporting(false)
                    }
                  }}
                  disabled={exporting}
                >
                  {exporting ? 'Generating…' : 'Download PDF'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


