'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { FileText, FileCheck, Receipt, FileSignature } from 'lucide-react'

interface ProjectDetailModalProps {
  projectId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ProjectDetailModal({ projectId, open, onOpenChange }: ProjectDetailModalProps) {
  const { t } = useTranslation(['projects'])
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any | null>(null)

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
  const isHistorical = data?.is_historical || project?.is_historical
  const fileKeys = data?.file_keys || {}

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('management.detail_modal.title')}
            {isHistorical && <span className="ml-2 text-sm text-muted-foreground font-normal">(Historical Project)</span>}
          </DialogTitle>
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
                {(project?.individuals || project?.family) && (
                  <div>
                    <Label>Reach Data</Label>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Individuals</div>
                        <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.individuals ? Number(project.individuals).toLocaleString() : '-'}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Families</div>
                        <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.family ? Number(project.family).toLocaleString() : '-'}</div>
                      </div>
                    </div>
                    {(project?.male_over_18 || project?.female_over_18 || project?.male_under_18 || project?.female_under_18) && (
                      <div className="grid grid-cols-4 gap-4 mt-2">
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Male &gt;18</div>
                          <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.male_over_18 ? Number(project.male_over_18).toLocaleString() : '-'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Female &gt;18</div>
                          <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.female_over_18 ? Number(project.female_over_18).toLocaleString() : '-'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Male &lt;18</div>
                          <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.male_under_18 ? Number(project.male_under_18).toLocaleString() : '-'}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Female &lt;18</div>
                          <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.female_under_18 ? Number(project.female_under_18).toLocaleString() : '-'}</div>
                        </div>
                      </div>
                    )}
                    {project?.people_with_special_needs !== null && project?.people_with_special_needs !== undefined && (
                      <div className="mt-2">
                        <div className="text-sm text-muted-foreground mb-1">People with special needs</div>
                        <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(project.people_with_special_needs).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                )}
                {project?.lessons_learned && (
                  <div>
                    <Label>Lessons Learned</Label>
                    <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.lessons_learned}</div>
                  </div>
                )}
                {project?.challenges && (
                  <div>
                    <Label>Challenges</Label>
                    <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.challenges}</div>
                  </div>
                )}
                {project?.recommendations && (
                  <div>
                    <Label>Recommendations</Label>
                    <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.recommendations}</div>
                  </div>
                )}
                {project?.comments && (
                  <div>
                    <Label>Comments</Label>
                    <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project.comments}</div>
                  </div>
                )}
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
                {(fileKeys.f1_file || fileKeys.f2_approval || fileKeys.payment_confirmation || fileKeys.signed_mou) && (
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
                  <Label>{t('management.detail_modal.labels.f4_reports')}</Label>
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
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


