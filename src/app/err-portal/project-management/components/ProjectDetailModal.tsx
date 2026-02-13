'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { FileText, FileCheck, Receipt, FileSignature, CheckCircle } from 'lucide-react'

interface ProjectDetailModalProps {
  projectId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ProjectDetailModal({ projectId, open, onOpenChange }: ProjectDetailModalProps) {
  const { t } = useTranslation(['projects'])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any | null>(null)
  const [completing, setCompleting] = useState(false)

  useEffect(() => {
    if (!open || !projectId) { setData(null); return }
    ;(async ()=>{
      try {
        setLoading(true)
        const res = await fetch(`/api/overview/project/${projectId}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Failed to load project')
        setData(j)
      } catch (e) {
        console.error(e)
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, projectId])

  const project = data?.project
  const room = project?.emergency_rooms
  const summaries = data?.summaries || []
  const historicalFinancialReports = data?.historical_financial_reports || []
  const f5Reports = data?.f5Reports || []
  const isHistorical = data?.is_historical || project?.is_historical
  const fileKeys = data?.file_keys || {}
  const f4Files = data?.f4_files || []
  const f5Files = data?.f5_files || []

  const handleFileClick = async (fileKey: string, fileName: string) => {
    if (!fileKey) return
    try {
      const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(fileKey)}`)
      if (!response.ok) {
        throw new Error('Failed to get signed URL')
      }
      const { url, error } = await response.json()
      if (error || !url) {
        throw new Error(error || 'No URL returned')
      }
      const link = document.createElement('a')
      link.href = url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error('Error opening file:', error)
      alert(`Failed to open ${fileName}`)
    }
  }

  const handleCompleteProject = async () => {
    if (!projectId || isHistorical) return
    
    if (!confirm('Are you sure you want to mark this project as completed?')) {
      return
    }

    try {
      setCompleting(true)
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to complete project')
      }

      // Refresh project data
      const res = await fetch(`/api/overview/project/${projectId}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'Failed to reload project')
      setData(j)
    } catch (error: any) {
      console.error('Error completing project:', error)
      alert(error.message || 'Failed to complete project')
    } finally {
      setCompleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {t('management.detail_modal.title')}
              {isHistorical && <span className="ml-2 text-sm text-muted-foreground font-normal">(Historical Project)</span>}
            </DialogTitle>
            {!isHistorical && project?.status !== 'completed' && (
              <Button
                onClick={handleCompleteProject}
                disabled={completing}
                variant="default"
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {completing ? 'Completing...' : 'Complete Project'}
              </Button>
            )}
            {!isHistorical && project?.status === 'completed' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4" />
                <span>Completed</span>
              </div>
            )}
          </div>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">{t('management.detail_modal.loading')}</div>
        ) : !project ? (
          <div className="py-8 text-center text-muted-foreground">{t('management.detail_modal.no_data')}</div>
        ) : (
          <div className="space-y-6">
            {isHistorical ? (
              <>
                {/* Historical Project Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Serial Number</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.serial_number || '-'}</div>
                  </div>
                  <div>
                    <Label>Project Status</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.status || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('management.detail_modal.labels.err')}</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{room?.name || room?.err_code || '-'}</div>
                  </div>
                  <div>
                    <Label>{t('management.detail_modal.labels.state')}</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.state || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Project Donor</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.project_donor || '-'}</div>
                  </div>
                  <div>
                    <Label>Partner</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.partner || '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Sector (Primary)</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.sector_primary || '-'}</div>
                  </div>
                  <div>
                    <Label>Sector (Secondary)</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.sector_secondary || '-'}</div>
                  </div>
                </div>
                <div>
                  <Label>Description of ERRs activity</Label>
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.project_objectives || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Target (Individuals)</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.estimated_beneficiaries ? Number(project.estimated_beneficiaries).toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <Label>Target (Families)</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.intended_beneficiaries ? (project.intended_beneficiaries.includes('Families:') ? project.intended_beneficiaries.split('Families:')[1].trim() : '-') : '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>MOU Signed</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.mou_signed || '-'}</div>
                  </div>
                  <div>
                    <Label>Date Transfer</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.date_transfer ? new Date(project.date_transfer).toLocaleDateString() : '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>USD Amount</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">${project?.usd ? Number(project.usd).toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <Label>SDG Amount</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.sdg ? Number(project.sdg).toLocaleString() : '-'}</div>
                  </div>
                  <div>
                    <Label>Rate</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.rate ? Number(project.rate).toLocaleString() : '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date (Activity)</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.start_date_activity ? new Date(project.start_date_activity).toLocaleDateString() : '-'}</div>
                  </div>
                  <div>
                    <Label>End Date (Activity)</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.end_date_activity ? new Date(project.end_date_activity).toLocaleDateString() : '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>F1 Status</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.f1_status || '-'}</div>
                  </div>
                  <div>
                    <Label>F1 Date Submitted</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.f1_date_submitted ? new Date(project.f1_date_submitted).toLocaleDateString() : '-'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>F4 Status</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.f4_status || '-'}</div>
                  </div>
                  <div>
                    <Label>F5 Status</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.f5_status || '-'}</div>
                  </div>
                </div>
                <div>
                  <Label>Date Report Completed</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.date_report_completed ? new Date(project.date_report_completed).toLocaleDateString() : '-'}</div>
                </div>

                {/* F4 Financial Reports Section for Historical Projects */}
                <div className="mt-6 pt-6 border-t">
                  <Label className="text-base font-semibold mb-3">F4 Financial Reports</Label>
                  {/* Historical financial report topline (from historical_financial_reports table) */}
                  {historicalFinancialReports.length > 0 && (
                    <div className="mb-6">
                      <Label className="text-sm font-medium mb-2">Historical Financial Report (topline)</Label>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>State</TableHead>
                            <TableHead className="text-right">Total ERRs Expenditure (USD)</TableHead>
                            <TableHead className="text-right">Total Budget Received (USD)</TableHead>
                            <TableHead className="text-right">Submit %</TableHead>
                            <TableHead className="text-right">Balance (USD)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {historicalFinancialReports.map((hfr: any, idx: number) => (
                            <TableRow key={hfr.id ?? idx}>
                              <TableCell>{hfr.state ?? '-'}</TableCell>
                              <TableCell className="text-right">{Number(hfr.total_errs_expenditure_usd ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{Number(hfr.total_budget_received_usd ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{hfr.submit_pct != null ? Number(hfr.submit_pct).toLocaleString() + '%' : '-'}</TableCell>
                              <TableCell className="text-right">{hfr.balance_usd ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {/* Category breakdown (optional topline) */}
                      {historicalFinancialReports[0] && (
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                          {[
                            { key: 'protection', label: 'Protection' },
                            { key: 'shelter_nfis', label: 'Shelter / NFI' },
                            { key: 'wash', label: 'WASH' },
                            { key: 'food_security', label: 'Food Security' },
                            { key: 'health', label: 'Health' },
                            { key: 'support_logistics', label: 'Support / Logistics' },
                            { key: 'volunteer_support', label: 'Volunteer Support' },
                            { key: 'women_children_needs', label: 'Women & Children' },
                            { key: 'mental_physical_health', label: 'Mental / Physical Health' },
                            { key: 'education', label: 'Education' },
                            { key: 'capacity_building', label: 'Capacity Building' },
                            { key: 'livelihoods', label: 'Livelihoods' },
                            { key: 'agriculture_support', label: 'Agriculture' },
                            { key: 'media', label: 'Media' },
                            { key: 'local_contribution', label: 'Local Contribution' }
                          ].map(({ key, label }) => {
                            const val = historicalFinancialReports[0][key]
                            if (val == null || val === '') return null
                            return (
                              <div key={key} className="flex justify-between gap-2 py-1 border-b border-muted/50">
                                <span className="text-muted-foreground">{label}</span>
                                <span>{typeof val === 'number' ? Number(val).toLocaleString() : String(val)}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Portal-uploaded F4 summaries (err_summary / err_expense) */}
                  {summaries.length > 0 ? (
                    <>
                      <Label className="text-sm font-medium mb-2">F4 Reports (portal)</Label>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Report Date</TableHead>
                            <TableHead className="text-right">Total Grant (USD)</TableHead>
                            <TableHead className="text-right">Total Expenses (USD)</TableHead>
                            <TableHead className="text-right">Total Expenses (SDG)</TableHead>
                            <TableHead className="text-right">Remainder (USD)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {summaries.map((s: any) => (
                            <TableRow key={s.id}>
                              <TableCell>{s.report_date ? new Date(s.report_date).toLocaleDateString() : '-'}</TableCell>
                              <TableCell className="text-right">{Number(s.total_grant || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{Number(s.total_expenses || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{Number(s.total_expenses_sdg || 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right">{Number(s.remainder || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* F4 Expenses for Latest Report */}
                      {summaries[0]?.expenses && summaries[0].expenses.length > 0 && (
                        <div className="mt-4">
                          <Label className="text-sm font-medium mb-2">Latest F4 Expenses</Label>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Activity</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount (USD)</TableHead>
                                <TableHead className="text-right">Amount (SDG)</TableHead>
                                <TableHead>Payment Date</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Receipt No.</TableHead>
                                <TableHead>Seller</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {summaries[0].expenses.map((e: any) => (
                                <TableRow key={e.expense_id}>
                                  <TableCell>{e.expense_activity || '-'}</TableCell>
                                  <TableCell>{e.expense_description || '-'}</TableCell>
                                  <TableCell className="text-right">{Number(e.expense_amount || 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-right">{Number(e.expense_amount_sdg || 0).toLocaleString()}</TableCell>
                                  <TableCell>{e.payment_date ? new Date(e.payment_date).toLocaleDateString() : '-'}</TableCell>
                                  <TableCell>{e.payment_method || '-'}</TableCell>
                                  <TableCell>{e.receipt_no || '-'}</TableCell>
                                  <TableCell>{e.seller || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* F4 Additional Fields */}
                      {summaries[0] && (
                        <div className="mt-4 space-y-4">
                          {summaries[0].beneficiaries && (
                            <div>
                              <Label className="text-sm font-medium">Beneficiaries</Label>
                              <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                                {summaries[0].beneficiaries}
                              </div>
                            </div>
                          )}
                          {summaries[0].lessons && (
                            <div>
                              <Label className="text-sm font-medium">Lessons Learned</Label>
                              <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                                {summaries[0].lessons}
                              </div>
                            </div>
                          )}
                          {summaries[0].training && (
                            <div>
                              <Label className="text-sm font-medium">Training Needs</Label>
                              <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                                {summaries[0].training}
                              </div>
                            </div>
                          )}
                          {summaries[0].project_objectives && (
                            <div>
                              <Label className="text-sm font-medium">Project Objectives</Label>
                              <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                                {summaries[0].project_objectives}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                  {historicalFinancialReports.length === 0 && summaries.length === 0 && (
                    <div className="py-4 text-center text-muted-foreground">No F4 reports available</div>
                  )}
                </div>

                {/* F5 Program Data Section */}
                {(project?.volunteers !== null && project?.volunteers !== undefined) ||
                 project?.family ||
                 project?.individuals ||
                 (project?.male_over_18 !== null && project?.male_over_18 !== undefined) ||
                 (project?.female_over_18 !== null && project?.female_over_18 !== undefined) ||
                 (project?.male_under_18 !== null && project?.male_under_18 !== undefined) ||
                 (project?.female_under_18 !== null && project?.female_under_18 !== undefined) ||
                 (project?.people_with_special_needs !== null && project?.people_with_special_needs !== undefined) ||
                 project?.lessons_learned ||
                 project?.challenges ||
                 project?.recommendations ||
                 project?.comments ? (
                  <div className="mt-6 pt-6 border-t">
                    <Label className="text-base font-semibold mb-3">F5 Program Data</Label>
                    
                    {/* Reach Data */}
                    {(project?.volunteers !== null && project?.volunteers !== undefined) ||
                     project?.family ||
                     project?.individuals ||
                     (project?.male_over_18 !== null && project?.male_over_18 !== undefined) ||
                     (project?.female_over_18 !== null && project?.female_over_18 !== undefined) ||
                     (project?.male_under_18 !== null && project?.male_under_18 !== undefined) ||
                     (project?.female_under_18 !== null && project?.female_under_18 !== undefined) ||
                     (project?.people_with_special_needs !== null && project?.people_with_special_needs !== undefined) ? (
                      <div className="mb-4">
                        <Label className="text-sm font-medium mb-2">Reach Data</Label>
                        <div className="grid grid-cols-2 gap-4">
                          {(project?.volunteers !== null && project?.volunteers !== undefined) && (
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">Volunteers</div>
                              <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.volunteers).toLocaleString()}</div>
                            </div>
                          )}
                          {project?.family && (
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">Families</div>
                              <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project.family}</div>
                            </div>
                          )}
                          {project?.individuals && (
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">Individuals</div>
                              <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project.individuals}</div>
                            </div>
                          )}
                          {(project?.people_with_special_needs !== null && project?.people_with_special_needs !== undefined) && (
                            <div>
                              <div className="text-sm text-muted-foreground mb-1">People with Special Needs</div>
                              <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.people_with_special_needs).toLocaleString()}</div>
                            </div>
                          )}
                        </div>
                        {(project?.male_over_18 !== null && project?.male_over_18 !== undefined) ||
                         (project?.female_over_18 !== null && project?.female_over_18 !== undefined) ||
                         (project?.male_under_18 !== null && project?.male_under_18 !== undefined) ||
                         (project?.female_under_18 !== null && project?.female_under_18 !== undefined) ? (
                          <div className="grid grid-cols-4 gap-4 mt-2">
                            {(project?.male_over_18 !== null && project?.male_over_18 !== undefined) && (
                              <div>
                                <div className="text-sm text-muted-foreground mb-1">Male &gt;18</div>
                                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.male_over_18).toLocaleString()}</div>
                              </div>
                            )}
                            {(project?.female_over_18 !== null && project?.female_over_18 !== undefined) && (
                              <div>
                                <div className="text-sm text-muted-foreground mb-1">Female &gt;18</div>
                                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.female_over_18).toLocaleString()}</div>
                              </div>
                            )}
                            {(project?.male_under_18 !== null && project?.male_under_18 !== undefined) && (
                              <div>
                                <div className="text-sm text-muted-foreground mb-1">Male &lt;18</div>
                                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.male_under_18).toLocaleString()}</div>
                              </div>
                            )}
                            {(project?.female_under_18 !== null && project?.female_under_18 !== undefined) && (
                              <div>
                                <div className="text-sm text-muted-foreground mb-1">Female &lt;18</div>
                                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.female_under_18).toLocaleString()}</div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {/* F5 Narrative Fields */}
                    <div className="space-y-4">
                      {project?.lessons_learned && (
                        <div>
                          <Label className="text-sm font-medium">Lessons Learned</Label>
                          <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.lessons_learned}</div>
                        </div>
                      )}
                      {project?.challenges && (
                        <div>
                          <Label className="text-sm font-medium">Challenges</Label>
                          <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.challenges}</div>
                        </div>
                      )}
                      {project?.recommendations && (
                        <div>
                          <Label className="text-sm font-medium">Recommendations</Label>
                          <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.recommendations}</div>
                        </div>
                      )}
                      {project?.comments && (
                        <div>
                          <Label className="text-sm font-medium">Comments</Label>
                          <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.comments}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Related Files Section for Historical Projects */}
                <div className="mt-6 pt-6 border-t">
                  <Label className="text-base font-semibold mb-3">Related Files</Label>
                  {f4Files.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {f4Files.map((file: any, idx: number) => {
                        const summary = summaries.find((s: any) => s.id === file.summary_id)
                        const reportDate = summary?.report_date ? new Date(summary.report_date).toLocaleDateString() : null
                        const label = reportDate ? `F4 Financial Report (${reportDate})` : 'F4 Financial Report'
                        return (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileClick(file.file_key, label)}
                            className="flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            {label}
                          </Button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-muted-foreground">No related files available</div>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Regular Project Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('management.detail_modal.labels.err')}</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{room?.name || room?.name_ar || room?.err_code || '-'}</div>
                  </div>
                  <div>
                    <Label>{t('management.detail_modal.labels.state')}</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.state || '-'}</div>
                  </div>
                </div>
                <div>
                  <Label>{t('management.detail_modal.labels.project_objectives')}</Label>
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.project_objectives || '-'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t('management.detail_modal.labels.intended_beneficiaries')}</Label>
                    <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.intended_beneficiaries || '-'}</div>
                  </div>
                  <div>
                    <Label>{t('management.detail_modal.labels.estimated_beneficiaries')}</Label>
                    <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.estimated_beneficiaries ?? '-'}</div>
                  </div>
                </div>

                {/* File Links */}
                {(fileKeys.f1_file || fileKeys.f2_approval || fileKeys.payment_confirmation || fileKeys.signed_mou || f4Files.length > 0 || f5Files.length > 0) && (
                  <div>
                    <Label className="text-base font-semibold mb-3">Project Files</Label>
                    <div className="flex flex-wrap gap-2">
                      {fileKeys.f1_file && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileClick(fileKeys.f1_file, 'F1 file')}
                          className="flex items-center gap-2"
                        >
                          <FileText className="h-4 w-4" />
                          F1 file
                        </Button>
                      )}
                      {fileKeys.f2_approval && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileClick(fileKeys.f2_approval, 'F2 Community Approval')}
                          className="flex items-center gap-2"
                        >
                          <FileCheck className="h-4 w-4" />
                          F2 Community Approval
                        </Button>
                      )}
                      {fileKeys.payment_confirmation && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileClick(fileKeys.payment_confirmation, 'Payment Confirmation')}
                          className="flex items-center gap-2"
                        >
                          <Receipt className="h-4 w-4" />
                          Payment Confirmation
                        </Button>
                      )}
                      {fileKeys.signed_mou && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleFileClick(fileKeys.signed_mou, 'Signed MOU')}
                          className="flex items-center gap-2"
                        >
                          <FileSignature className="h-4 w-4" />
                          Signed MOU
                        </Button>
                      )}
                      {f4Files.map((file: any, idx: number) => {
                        const summary = summaries.find((s: any) => s.id === file.summary_id)
                        const reportDate = summary?.report_date ? new Date(summary.report_date).toLocaleDateString() : null
                        const label = reportDate ? `F4 Financial Report (${reportDate})` : 'F4 Financial Report'
                        return (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileClick(file.file_key, label)}
                            className="flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            {label}
                          </Button>
                        )
                      })}
                      {f5Files.map((file: any, idx: number) => {
                        const report = f5Reports.find((r: any) => r.id === file.report_id)
                        const reportDate = report?.report_date ? new Date(report.report_date).toLocaleDateString() : null
                        const label = reportDate ? `F5 Program Report (${reportDate})` : 'F5 Program Report'
                        return (
                          <Button
                            key={idx}
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileClick(file.file_url, label)}
                            className="flex items-center gap-2"
                          >
                            <FileText className="h-4 w-4" />
                            {label}
                          </Button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* F1 Project Budget Table */}
                {(project?.planned_activities || project?.expenses) && (
                  <div>
                    <Label className="text-base font-semibold mb-3">F1 Project Budget</Label>
                    <div className="space-y-4">
                      {/* Planned Activities */}
                      {project?.planned_activities && (
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">Planned Activities</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Activity</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Families</TableHead>
                                <TableHead className="text-right">Individuals</TableHead>
                                <TableHead className="text-right">Planned Cost (USD)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(() => {
                                try {
                                  const planned = typeof project.planned_activities === 'string' 
                                    ? JSON.parse(project.planned_activities) 
                                    : project.planned_activities
                                  const activities = Array.isArray(planned) ? planned : []
                                  if (activities.length === 0) {
                                    return (
                                      <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">No planned activities</TableCell>
                                      </TableRow>
                                    )
                                  }
                                  const total = activities.reduce((sum: number, a: any) => sum + (Number(a.planned_activity_cost || 0)), 0)
                                  return (
                                    <>
                                      {activities.map((a: any, idx: number) => (
                                        <TableRow key={idx}>
                                          <TableCell>{a.activity || '-'}</TableCell>
                                          <TableCell>{a.category || '-'}</TableCell>
                                          <TableCell className="text-right">{a.families ? Number(a.families).toLocaleString() : '-'}</TableCell>
                                          <TableCell className="text-right">{a.individuals ? Number(a.individuals).toLocaleString() : '-'}</TableCell>
                                          <TableCell className="text-right">{a.planned_activity_cost ? Number(a.planned_activity_cost).toLocaleString() : '-'}</TableCell>
                                        </TableRow>
                                      ))}
                                      <TableRow className="bg-muted/50 font-semibold">
                                        <TableCell colSpan={4} className="font-semibold">Total</TableCell>
                                        <TableCell className="text-right font-semibold">{total.toLocaleString()}</TableCell>
                                      </TableRow>
                                    </>
                                  )
                                } catch {
                                  return (
                                    <TableRow>
                                      <TableCell colSpan={5} className="text-center text-muted-foreground">Error parsing planned activities</TableCell>
                                    </TableRow>
                                  )
                                }
                              })()}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Expenses */}
                      {project?.expenses && (
                        <div>
                          <div className="text-sm font-medium mb-2 text-muted-foreground">Expenses</div>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Activity</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Planned Activity</TableHead>
                                <TableHead className="text-right">Total Cost (USD)</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(() => {
                                try {
                                  const expenses = typeof project.expenses === 'string' 
                                    ? JSON.parse(project.expenses) 
                                    : project.expenses
                                  const expenseList = Array.isArray(expenses) ? expenses : []
                                  if (expenseList.length === 0) {
                                    return (
                                      <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground">No expenses</TableCell>
                                      </TableRow>
                                    )
                                  }
                                  const total = expenseList.reduce((sum: number, e: any) => sum + (Number(e.total_cost || 0)), 0)
                                  return (
                                    <>
                                      {expenseList.map((e: any, idx: number) => (
                                        <TableRow key={idx}>
                                          <TableCell>{e.activity || '-'}</TableCell>
                                          <TableCell>{e.category || '-'}</TableCell>
                                          <TableCell>
                                            {e.planned_activity || '-'}
                                            {e.planned_activity_other && ` (${e.planned_activity_other})`}
                                          </TableCell>
                                          <TableCell className="text-right">{e.total_cost ? Number(e.total_cost).toLocaleString() : '-'}</TableCell>
                                        </TableRow>
                                      ))}
                                      <TableRow className="bg-muted/50 font-semibold">
                                        <TableCell colSpan={3} className="font-semibold">Total</TableCell>
                                        <TableCell className="text-right font-semibold">{total.toLocaleString()}</TableCell>
                                      </TableRow>
                                    </>
                                  )
                                } catch {
                                  return (
                                    <TableRow>
                                      <TableCell colSpan={4} className="text-center text-muted-foreground">Error parsing expenses</TableCell>
                                    </TableRow>
                                  )
                                }
                              })()}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* F4 summaries - only for regular projects */}
            {!isHistorical && (
              <>
                <div>
                  <Label className="text-base font-semibold mb-3">F4 Financial Reports</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('management.detail_modal.table.report_date')}</TableHead>
                        <TableHead className="text-right">{t('management.detail_modal.table.total_grant')}</TableHead>
                        <TableHead className="text-right">{t('management.detail_modal.table.total_expenses')}</TableHead>
                        <TableHead className="text-right">{t('management.detail_modal.table.remainder')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaries.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">{t('management.detail_modal.table.no_reports')}</TableCell></TableRow>
                      ) : summaries.map((s:any)=> (
                        <TableRow key={s.id}>
                          <TableCell>{s.report_date ? new Date(s.report_date).toLocaleDateString() : '-'}</TableCell>
                          <TableCell className="text-right">{Number(s.total_grant || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{Number(s.total_expenses || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{Number(s.remainder || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* F4 expenses (for latest report) */}
                {summaries.length > 0 && (
                  <div>
                    <Label>{t('management.detail_modal.labels.latest_f4_expenses')}</Label>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('management.detail_modal.table.activity')}</TableHead>
                          <TableHead>{t('management.detail_modal.table.description')}</TableHead>
                          <TableHead className="text-right">{t('management.detail_modal.table.amount')}</TableHead>
                          <TableHead>{t('management.detail_modal.table.payment_date')}</TableHead>
                          <TableHead>{t('management.detail_modal.table.method')}</TableHead>
                          <TableHead>{t('management.detail_modal.table.receipt')}</TableHead>
                          <TableHead>{t('management.detail_modal.table.seller')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(summaries[0].expenses || []).length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{t('management.detail_modal.table.no_expenses')}</TableCell></TableRow>
                        ) : (summaries[0].expenses || []).map((e:any)=> (
                          <TableRow key={e.expense_id}>
                            <TableCell>{e.expense_activity || '-'}</TableCell>
                            <TableCell>{e.expense_description || '-'}</TableCell>
                            <TableCell className="text-right">{Number(e.expense_amount || 0).toLocaleString()}</TableCell>
                            <TableCell>{e.payment_date ? new Date(e.payment_date).toLocaleDateString() : '-'}</TableCell>
                            <TableCell>{e.payment_method || '-'}</TableCell>
                            <TableCell>{e.receipt_no || '-'}</TableCell>
                            <TableCell>{e.seller || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* F5 Reports */}
                {f5Reports.length > 0 && (
                  <>
                    <div>
                      <Label className="text-base font-semibold mb-3">F5 Program Reports</Label>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Report Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {f5Reports.map((r:any)=> (
                            <TableRow key={r.id}>
                              <TableCell>{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* F5 Report Details (for latest report) */}
                    {f5Reports[0] && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label className="text-sm font-medium">Positive Changes</Label>
                            <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                              {f5Reports[0].positive_changes || '-'}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Negative Results</Label>
                            <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                              {f5Reports[0].negative_results || '-'}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Unexpected Results</Label>
                            <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                              {f5Reports[0].unexpected_results || '-'}
                            </div>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Lessons Learned</Label>
                            <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                              {f5Reports[0].lessons_learned || '-'}
                            </div>
                          </div>
                          <div className="md:col-span-2">
                            <Label className="text-sm font-medium">Suggestions</Label>
                            <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">
                              {f5Reports[0].suggestions || '-'}
                            </div>
                          </div>
                        </div>

                        {/* F5 Reach Activities */}
                        {f5Reports[0].reach && f5Reports[0].reach.length > 0 && (
                          <div>
                            <Label className="text-sm font-medium mb-2">Implemented Activities</Label>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Activity Name</TableHead>
                                  <TableHead>Activity Goal</TableHead>
                                  <TableHead>Location</TableHead>
                                  <TableHead>Start Date</TableHead>
                                  <TableHead>End Date</TableHead>
                                  <TableHead className="text-right">Individuals</TableHead>
                                  <TableHead className="text-right">Households</TableHead>
                                  <TableHead className="text-right">Male</TableHead>
                                  <TableHead className="text-right">Female</TableHead>
                                  <TableHead className="text-right">Male &lt;18</TableHead>
                                  <TableHead className="text-right">Female &lt;18</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {f5Reports[0].reach.map((r: any, idx: number) => (
                                  <TableRow key={r.id || idx}>
                                    <TableCell>{r.activity_name || '-'}</TableCell>
                                    <TableCell>{r.activity_goal || '-'}</TableCell>
                                    <TableCell>{r.location || '-'}</TableCell>
                                    <TableCell>{r.start_date ? new Date(r.start_date).toLocaleDateString() : '-'}</TableCell>
                                    <TableCell>{r.end_date ? new Date(r.end_date).toLocaleDateString() : '-'}</TableCell>
                                    <TableCell className="text-right">{r.individual_count ? Number(r.individual_count).toLocaleString() : '-'}</TableCell>
                                    <TableCell className="text-right">{r.household_count ? Number(r.household_count).toLocaleString() : '-'}</TableCell>
                                    <TableCell className="text-right">{r.male_count ? Number(r.male_count).toLocaleString() : '-'}</TableCell>
                                    <TableCell className="text-right">{r.female_count ? Number(r.female_count).toLocaleString() : '-'}</TableCell>
                                    <TableCell className="text-right">{r.under18_male ? Number(r.under18_male).toLocaleString() : '-'}</TableCell>
                                    <TableCell className="text-right">{r.under18_female ? Number(r.under18_female).toLocaleString() : '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {f5Reports.length === 0 && (
                  <div>
                    <Label className="text-base font-semibold mb-3">F5 Program Reports</Label>
                    <div className="py-4 text-center text-muted-foreground">No F5 reports</div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


