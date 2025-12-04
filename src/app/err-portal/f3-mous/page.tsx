'use client'

import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye, Upload, Receipt, FileSignature, FileCheck } from 'lucide-react'
import dynamic from 'next/dynamic'
import { aggregateObjectives, aggregateBeneficiaries, aggregatePlannedActivities, aggregatePlannedActivitiesDetailed, aggregateLocations, getBankingDetails } from '@/lib/mou-aggregation'

interface MOU {
  id: string
  mou_code: string
  partner_name: string
  err_name: string
  state: string | null
  total_amount: number
  start_date: string | null
  end_date: string | null
  file_key: string | null
  payment_confirmation_file: string | null
  signed_mou_file_key: string | null
  banking_details_override: string | null
  partner_contact_override: string | null
  err_contact_override: string | null
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
  const { t, i18n } = useTranslation(['f3', 'common'])
  const [mous, setMous] = useState<MOU[]>([])
  const [selectedState, setSelectedState] = useState<string>('all')
  const [availableStates, setAvailableStates] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeMou, setActiveMou] = useState<MOU | null>(null)
  const [detail, setDetail] = useState<MOUDetail | null>(null)
  const [translations, setTranslations] = useState<{ objectives_en?: string; beneficiaries_en?: string; activities_en?: string; objectives_ar?: string; beneficiaries_ar?: string; activities_ar?: string }>({})
  const [exporting, setExporting] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingMou, setEditingMou] = useState<Partial<MOU>>({})
  const [saving, setSaving] = useState(false)
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

  // Aggregate data from all projects
  const aggregatedData = useMemo(() => {
    const projects = detail?.projects || (detail?.project ? [detail.project] : [])
    if (projects.length === 0) {
      return {
        objectives: null,
        beneficiaries: null,
        activities: null,
        activitiesDetailed: null,
        locations: { localities: '', state: null },
        banking: null
      }
    }

    return {
      objectives: aggregateObjectives(projects),
      beneficiaries: aggregateBeneficiaries(projects),
      activities: aggregatePlannedActivities(projects),
      activitiesDetailed: aggregatePlannedActivitiesDetailed(projects),
      locations: aggregateLocations(projects),
      banking: getBankingDetails(projects)
    }
  }, [detail])

  const fetchMous = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedState && selectedState !== 'all') params.append('state', selectedState)
      
      const res = await fetch(`/api/f3/mous?${params.toString()}`)
      const data = await res.json()
      setMous(data)
      
      // Extract unique states from MOUs for the filter dropdown
      const uniqueStates = Array.from(new Set(data.map((m: MOU) => m.state).filter(Boolean))) as string[]
      setAvailableStates(uniqueStates.sort())
    } catch (e) {
      console.error('Failed to load MOUs', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMous()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedState])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('f3:title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {availableStates.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('common:loading') || 'Loading...'}</div>
          ) : (
            <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('f3:headers.mou_code')}</TableHead>
                  <TableHead>{t('f3:headers.partner')}</TableHead>
                  <TableHead>{t('f3:headers.err_state')}</TableHead>
                  <TableHead className="text-right">{t('f3:headers.total')}</TableHead>
                  <TableHead>{t('f3:headers.end_date')}</TableHead>
                  <TableHead>{t('f3:headers.created')}</TableHead>
                  <TableHead>{t('f3:headers.actions')}</TableHead>
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
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={async () => {
                          setActiveMou(m)
                          setEditMode(false)
                          setEditingMou({})
                          setPreviewOpen(true)
                          try {
                            const res = await fetch(`/api/f3/mous/${m.id}`)
                            const data = await res.json()
                            setDetail(data)
                            // Update activeMou with latest data including override fields
                            if (data.mou) {
                              setActiveMou(data.mou)
                            }
                            // Attempt lightweight auto-translation for aggregated project fields
                            const projects = data?.projects || (data?.project ? [data.project] : [])
                            const objStr = aggregateObjectives(projects) || ''
                            const benStr = aggregateBeneficiaries(projects) || ''
                            const actStr = aggregatePlannedActivitiesDetailed(projects) || aggregatePlannedActivities(projects) || ''
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
                        title={t('f3:preview')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                        <input
                          type="file"
                          id={`payment-upload-${m.id}`}
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            try {
                              const formData = new FormData()
                              formData.append('file', file)

                              const response = await fetch(`/api/f3/mous/${m.id}/payment-confirmation`, {
                                method: 'POST',
                                body: formData
                              })

                              if (!response.ok) {
                                throw new Error('Failed to upload payment confirmation')
                              }

                              // Refresh the MOUs list
                              await fetchMous()
                              alert('Payment confirmation uploaded successfully')
                            } catch (error) {
                              console.error('Error uploading payment confirmation:', error)
                              alert('Failed to upload payment confirmation')
                            }

                            // Clear the input
                            e.target.value = ''
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={m.payment_confirmation_file ? async () => {
                            try {
                              // First get the signed URL
                              const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(m.payment_confirmation_file || '')}`)
                              if (!response.ok) {
                                throw new Error('Failed to get signed URL')
                              }
                              const { url, error } = await response.json()
                              if (error || !url) {
                                throw new Error(error || 'No URL returned')
                              }

                              // Create a link and click it
                              const link = document.createElement('a')
                              link.href = url
                              link.target = '_blank'
                              link.rel = 'noopener noreferrer'
                              document.body.appendChild(link)
                              link.click()
                              document.body.removeChild(link)
                            } catch (error) {
                              console.error('Error getting signed URL:', error)
                              alert('Failed to open payment confirmation')
                            }
                          } : () => {
                            document.getElementById(`payment-upload-${m.id}`)?.click()
                          }}
                          title={m.payment_confirmation_file ? t('f3:view_payment') : t('f3:add_payment')}
                        >
                          {m.payment_confirmation_file ? (
                            <Receipt className="h-4 w-4 text-green-600" />
                          ) : (
                            <Upload className="h-4 w-4 text-amber-600" />
                          )}
                        </Button>
                        <input
                          type="file"
                          id={`signed-mou-upload-${m.id}`}
                          className="hidden"
                          accept=".pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return

                            try {
                              const formData = new FormData()
                              formData.append('file', file)

                              const response = await fetch(`/api/f3/mous/${m.id}/signed-mou`, {
                                method: 'POST',
                                body: formData
                              })

                              if (!response.ok) {
                                throw new Error('Failed to upload signed MOU')
                              }

                              // Refresh the MOUs list
                              await fetchMous()
                              alert('Signed MOU uploaded successfully')
                            } catch (error) {
                              console.error('Error uploading signed MOU:', error)
                              alert('Failed to upload signed MOU')
                            }

                            // Clear the input
                            e.target.value = ''
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={m.signed_mou_file_key ? async () => {
                            try {
                              // First get the signed URL
                              const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(m.signed_mou_file_key || '')}`)
                              if (!response.ok) {
                                throw new Error('Failed to get signed URL')
                              }
                              const { url, error } = await response.json()
                              if (error || !url) {
                                throw new Error(error || 'No URL returned')
                              }

                              // Create a link and click it
                              const link = document.createElement('a')
                              link.href = url
                              link.target = '_blank'
                              link.rel = 'noopener noreferrer'
                              document.body.appendChild(link)
                              link.click()
                              document.body.removeChild(link)
                            } catch (error) {
                              console.error('Error getting signed URL:', error)
                              alert('Failed to open signed MOU')
                            }
                          } : () => {
                            document.getElementById(`signed-mou-upload-${m.id}`)?.click()
                          }}
                          title={m.signed_mou_file_key ? 'View Signed MOU' : 'Upload Signed MOU'}
                        >
                          {m.signed_mou_file_key ? (
                            <FileCheck className="h-4 w-4 text-green-600" />
                          ) : (
                            <FileSignature className="h-4 w-4 text-amber-600" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={(open) => {
        setPreviewOpen(open)
        if (!open) {
          setEditMode(false)
          setEditingMou({})
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeMou?.mou_code || 'MOU'}</DialogTitle>
          </DialogHeader>
          {activeMou && (
            <div id={previewId} className="space-y-4">
              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="text-lg font-semibold mb-2">
                  {t('f3:mou_agreement', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:mou_agreement', { lng: 'ar' })}</div>
                </div>
                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <Label>{t('f3:between', { lng: 'en' })}</Label>
                      <Input
                        value={editingMou.partner_name || ''}
                        onChange={(e) => setEditingMou({ ...editingMou, partner_name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>{t('f3:and', { lng: 'en' })}</Label>
                      <Input
                        value={editingMou.err_name || ''}
                        onChange={(e) => setEditingMou({ ...editingMou, err_name: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm">
                    <div className="font-medium">{t('f3:between', { lng: 'en' })}</div>
                    <div>{activeMou.partner_name}</div>
                    <div className="font-medium mt-2">{t('f3:and', { lng: 'en' })}</div>
                    <div>{activeMou.err_name}</div>
                    <div className="mt-3" dir="rtl">
                      <div className="font-medium">{t('f3:between', { lng: 'ar' })}</div>
                      <div>{activeMou.partner_name}</div>
                      <div className="font-medium mt-2">{t('f3:and', { lng: 'ar' })}</div>
                      <div>{activeMou.err_name}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">
                  1. {t('f3:purpose', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:purpose', { lng: 'ar' })}</div>
                </div>
                <p className="text-sm">{t('f3:purpose_desc', { lng: 'en', partner: activeMou.partner_name, err: activeMou.err_name })}</p>
                <p className="text-sm mt-2">{t('f3:activities_intro', { lng: 'en' })}</p>
                <p className="text-sm mt-2" dir="rtl">{t('f3:activities_intro', { lng: 'ar' })}</p>
                <p className="text-sm" dir="rtl">{t('f3:purpose_desc', { lng: 'ar', partner: activeMou.partner_name, err: activeMou.err_name })}</p>

                {/* English row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3" data-mou-subsection="true">
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{t('f3:shall_err', { err: activeMou.err_name })}</div>
                    <div className="text-sm space-y-2">
                      {(translations.objectives_en || aggregatedData.objectives) && (
                        <div>
                          <div className="font-semibold">{t('f3:objectives')}</div>
                          <div className="whitespace-pre-wrap">{translations.objectives_en || aggregatedData.objectives || ''}</div>
                        </div>
                      )}
                      {(translations.beneficiaries_en || aggregatedData.beneficiaries) && (
                        <div>
                          <div className="font-semibold">{t('f3:target_beneficiaries')}</div>
                          <div className="whitespace-pre-wrap">{translations.beneficiaries_en || aggregatedData.beneficiaries || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.activitiesDetailed || translations.activities_en || aggregatedData.activities) && (
                        <div>
                          <div className="font-semibold">{t('f3:planned_activities')}</div>
                          <div className="whitespace-pre-wrap">{aggregatedData.activitiesDetailed || translations.activities_en || aggregatedData.activities || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.locations.localities || aggregatedData.locations.state) && (
                        <div className="text-xs text-muted-foreground">{t('f3:location', { lng: 'en' })}: {aggregatedData.locations.localities || '-'} / {aggregatedData.locations.state || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{t('f3:shall_partner', { partner: activeMou.partner_name })}</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>{t('f3:partner_provide_sum', { amount: Number(activeMou.total_amount || 0).toLocaleString() })}</li>
                      <li>{t('f3:partner_accept_apps')}</li>
                      <li>{t('f3:partner_assess_needs')}</li>
                      <li>{t('f3:partner_support_followup')}</li>
                      <li>{t('f3:partner_report')}</li>
                    </ul>
                  </div>
                </div>

                {/* Arabic row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4" data-mou-subsection="true">
                  <div className="rounded-md border p-3" dir="rtl">
                    <div className="font-medium mb-2">تلتزم {activeMou.err_name}</div>
                    <div className="text-sm space-y-2">
                      {(translations.objectives_ar || aggregatedData.objectives) && (
                        <div>
                          <div className="font-semibold">الأهداف</div>
                          <div className="whitespace-pre-wrap">{translations.objectives_ar || aggregatedData.objectives || ''}</div>
                        </div>
                      )}
                      {(translations.beneficiaries_ar || aggregatedData.beneficiaries) && (
                        <div>
                          <div className="font-semibold">المستفيدون المستهدفون</div>
                          <div className="whitespace-pre-wrap">{translations.beneficiaries_ar || aggregatedData.beneficiaries || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.activitiesDetailed || translations.activities_ar || aggregatedData.activities) && (
                        <div>
                          <div className="font-semibold">الأنشطة المخططة</div>
                          <div className="whitespace-pre-wrap">{aggregatedData.activitiesDetailed || translations.activities_ar || aggregatedData.activities || ''}</div>
                        </div>
                      )}
                      {(aggregatedData.locations.localities || aggregatedData.locations.state) && (
                        <div className="text-xs text-muted-foreground">الموقع: {aggregatedData.locations.localities || '-'} / {aggregatedData.locations.state || '-'}</div>
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
                <div className="font-semibold mb-2">2. {t('f3:principles')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:principles_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:principles_ar_desc')}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">3. {t('f3:reports')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:reports_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:reports_ar_desc')}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">4. {t('f3:funding')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:funding_en_desc', { partner: activeMou.partner_name, amount: Number(activeMou.total_amount || 0).toLocaleString() })}</div>
                  <div className="rounded-md border p-3 text_sm" dir="rtl">{t('f3:funding_ar_desc', { partner: activeMou.partner_name, amount: Number(activeMou.total_amount || 0).toLocaleString() })}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">5. {t('f3:budget')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:budget_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:budget_ar_desc')}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">6. {t('f3:approved_accounts')}</div>
                {editMode ? (
                  <div>
                    <Label>Banking Details</Label>
                    <Textarea
                      value={editingMou.banking_details_override ?? ''}
                      onChange={(e) => setEditingMou({ ...editingMou, banking_details_override: e.target.value })}
                      className="mt-1 min-h-[100px]"
                      placeholder="Enter banking details..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">Leave empty to use aggregated data from projects</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">{(activeMou.banking_details_override || aggregatedData.banking) || t('f3:approved_accounts_en_desc')}</div>
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap" dir="rtl">{(activeMou.banking_details_override || aggregatedData.banking) || t('f3:approved_accounts_ar_desc')}</div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">
                  7. {t('f3:duration', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:duration', { lng: 'ar' })}</div>
                </div>
                {editMode ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date</Label>
                      <Input
                        type="date"
                        value={editingMou.start_date ? new Date(editingMou.start_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditingMou({ ...editingMou, start_date: e.target.value || null })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Input
                        type="date"
                        value={editingMou.end_date ? new Date(editingMou.end_date).toISOString().split('T')[0] : ''}
                        onChange={(e) => setEditingMou({ ...editingMou, end_date: e.target.value || null })}
                        className="mt-1"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm">
                      {activeMou.start_date && activeMou.end_date
                        ? `From ${new Date(activeMou.start_date).toLocaleDateString()} to ${new Date(activeMou.end_date).toLocaleDateString()}`
                        : activeMou.end_date
                        ? `Until ${new Date(activeMou.end_date).toLocaleDateString()}`
                        : t('f3:duration_en_open', { lng: 'en' })}
                    </p>
                    <p className="text-sm" dir="rtl">
                      {activeMou.start_date && activeMou.end_date
                        ? `من ${new Date(activeMou.start_date).toLocaleDateString('ar')} إلى ${new Date(activeMou.end_date).toLocaleDateString('ar')}`
                        : activeMou.end_date
                        ? `حتى ${new Date(activeMou.end_date).toLocaleDateString('ar')}`
                        : t('f3:duration_en_open', { lng: 'ar' })}
                    </p>
                  </>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">8. {t('f3:contact_info', { lng: 'en' })}
                  <div className="text-sm text-muted-foreground" dir="rtl">{t('f3:contact_info', { lng: 'ar' })}</div>
                </div>
                {editMode ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Partner Contact Information</Label>
                      <Textarea
                        value={editingMou.partner_contact_override ?? ''}
                        onChange={(e) => setEditingMou({ ...editingMou, partner_contact_override: e.target.value })}
                        className="mt-1 min-h-[80px]"
                        placeholder="Enter partner contact information..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty to use data from partners table</p>
                    </div>
                    <div>
                      <Label>ERR Contact Information</Label>
                      <Textarea
                        value={editingMou.err_contact_override ?? ''}
                        onChange={(e) => setEditingMou({ ...editingMou, err_contact_override: e.target.value })}
                        className="mt-1 min-h-[80px]"
                        placeholder="Enter ERR contact information..."
                      />
                      <p className="text-xs text-muted-foreground mt-1">Leave empty to use data from projects</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* English labels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="font-medium mb-1">{t('f3:partner_label', { lng: 'en' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.partner_contact_override || (detail?.partner ? `${detail.partner.name}${detail.partner.contact_person ? `\n${t('f3:representative', { lng: 'en' })}: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\n${t('f3:position', { lng: 'en' })}: ${detail.partner.position}` : ''}${detail.partner.email ? `\n${t('f3:email', { lng: 'en' })}: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\n${t('f3:phone', { lng: 'en' })}: ${detail.partner.phone_number}` : ''}` : activeMou.partner_name)}</div>
                      </div>
                      <div>
                        <div className="font-medium mb-1">{t('f3:err_label', { lng: 'en' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.err_contact_override || `${activeMou.err_name}${((detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name) ? `\n${t('f3:representative', { lng: 'en' })}: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${((detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone) ? `\n${t('f3:phone', { lng: 'en' })}: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`}</div>
                      </div>
                    </div>
                    {/* Arabic labels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-4" dir="rtl">
                      <div>
                        <div className="font-medium mb-1">{t('f3:partner_label', { lng: 'ar' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.partner_contact_override || (detail?.partner ? `${detail.partner.name}${detail.partner.contact_person ? `\n${t('f3:representative', { lng: 'ar' })}: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\n${t('f3:position', { lng: 'ar' })}: ${detail.partner.position}` : ''}${detail.partner.email ? `\n${t('f3:email', { lng: 'ar' })}: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\n${t('f3:phone', { lng: 'ar' })}: ${detail.partner.phone_number}` : ''}` : activeMou.partner_name)}</div>
                      </div>
                      <div>
                        <div className="font-medium mb-1">{t('f3:err_label', { lng: 'ar' })}</div>
                        <div className="whitespace-pre-wrap">{activeMou.err_contact_override || `${activeMou.err_name}${((detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name) ? `\n${t('f3:representative', { lng: 'ar' })}: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${((detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone) ? `\n${t('f3:phone', { lng: 'ar' })}: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-2 flex justify-end gap-2">
                {editMode ? (
                  <>
                    <Button variant="outline" onClick={() => {
                      setEditMode(false)
                      setEditingMou({})
                    }} disabled={saving}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        try {
                          setSaving(true)
                          const response = await fetch(`/api/f3/mous/${activeMou.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(editingMou)
                          })
                          if (!response.ok) {
                            throw new Error('Failed to save changes')
                          }
                          const updated = await response.json()
                          setActiveMou(updated)
                          setEditMode(false)
                          setEditingMou({})
                          // Refresh the MOUs list
                          await fetchMous()
                          alert('MOU updated successfully')
                        } catch (error) {
                          console.error('Error saving MOU:', error)
                          alert('Failed to save changes')
                        } finally {
                          setSaving(false)
                        }
                      }}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditMode(true)
                        // Initialize with current display values (override if exists, otherwise aggregated/fallback data)
                        const currentBanking = activeMou?.banking_details_override || aggregatedData.banking || ''
                        const currentPartnerContact = activeMou?.partner_contact_override || (detail?.partner ? `${detail.partner.name}${detail.partner.contact_person ? `\nRepresentative: ${detail.partner.contact_person}` : ''}${detail.partner.position ? `\nPosition: ${detail.partner.position}` : ''}${detail.partner.email ? `\nEmail: ${detail.partner.email}` : ''}${detail.partner.phone_number ? `\nPhone: ${detail.partner.phone_number}` : ''}` : activeMou?.partner_name || '')
                        const currentErrContact = activeMou?.err_contact_override || `${activeMou?.err_name || ''}${((detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name) ? `\nRepresentative: ${(detail?.projects && detail.projects[0]?.program_officer_name) || detail?.project?.program_officer_name}` : ''}${((detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone) ? `\nPhone: ${(detail?.projects && detail.projects[0]?.program_officer_phone) || detail?.project?.program_officer_phone}` : ''}`
                        
                        setEditingMou({
                          partner_name: activeMou?.partner_name || '',
                          err_name: activeMou?.err_name || '',
                          banking_details_override: activeMou?.banking_details_override !== null && activeMou?.banking_details_override !== undefined ? activeMou.banking_details_override : currentBanking,
                          partner_contact_override: activeMou?.partner_contact_override !== null && activeMou?.partner_contact_override !== undefined ? activeMou.partner_contact_override : currentPartnerContact,
                          err_contact_override: activeMou?.err_contact_override !== null && activeMou?.err_contact_override !== undefined ? activeMou.err_contact_override : currentErrContact,
                          start_date: activeMou?.start_date || null,
                          end_date: activeMou?.end_date || null
                        })
                      }}
                    >
                      Edit
                    </Button>
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
                  disabled={exporting || editMode}
                >
                  {exporting ? 'Generating…' : 'Download PDF'}
                </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


