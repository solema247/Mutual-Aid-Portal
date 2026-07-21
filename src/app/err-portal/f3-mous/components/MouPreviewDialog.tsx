'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Plus, X } from 'lucide-react'
import { formatProjectSummary } from '@/lib/mou-aggregation'
import HierarchicalBudgetTable from './HierarchicalBudgetTable'
import { splitApprovedAccountBlocks } from '../lib/mou-preview-helpers'
import { sumExpensesUsd } from '../lib/project-helpers'
import type { MouPreviewState } from '../hooks/useMouPreview'
import type { Signature } from '../types'

interface MouPreviewDialogProps extends MouPreviewState {
  canEditMou: boolean
}

export default function MouPreviewDialog({
  canEditMou,
  previewOpen,
  handlePreviewOpenChange,
  activeMou,
  detail,
  editMode,
  editingMou,
  setEditingMou,
  saving,
  previewId,
  aggregatedData,
  exporting,
  setExporting,
  forceBudgetExpanded,
  setForceBudgetExpanded,
  setEditMode,
  setPreviewOpen,
  handleSave,
  startEditMode,
  t,
}: MouPreviewDialogProps) {
  return (      <Dialog open={previewOpen} onOpenChange={handlePreviewOpenChange}>
        <DialogContent className="max-w-7xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeMou?.mou_code || 'MOU'}</DialogTitle>
          </DialogHeader>
          {activeMou && (() => {
            const viewMouProjects = detail?.projects || (detail?.project ? [detail.project] : [])
            const mouTotalFromProjects = viewMouProjects.reduce((s: number, p: any) => s + sumExpensesUsd(p.expenses), 0)
            const approvedAccountsText = activeMou.banking_details_override || aggregatedData.banking || ''
            const approvedAccountBlocks = approvedAccountsText ? splitApprovedAccountBlocks(approvedAccountsText) : []
            return (
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
                      {(() => {
                        const projects = detail?.projects || (detail?.project ? [detail.project] : [])
                        const uniqueLocalities = new Set<string>()
                        projects.forEach(p => {
                          if (p.locality) uniqueLocalities.add(p.locality)
                        })
                        const localityCount = uniqueLocalities.size
                        const localityList = Array.from(uniqueLocalities).join(', ')
                        const projectText = localityCount === 1 ? 'Project' : 'Projects'
                        const localityText = localityCount === 1 ? 'locality' : 'localities'
                        const standardObjective = `${projectText} to deliver humanitarian assistance across ${localityCount} ${localityText}: ${localityList}. Below is a summary of projects by each ERR.`
                        return (
                          <div>
                            <div className="font-semibold">{t('f3:objectives')}</div>
                            <div className="whitespace-pre-wrap">{standardObjective}</div>
                          </div>
                        )
                      })()}
                      {(() => {
                        const projects = detail?.projects || (detail?.project ? [detail.project] : [])
                        let totalIndividuals = 0
                        
                        projects.forEach(project => {
                          if (project.planned_activities) {
                            try {
                              const raw = typeof project.planned_activities === 'string' 
                                ? JSON.parse(project.planned_activities) 
                                : project.planned_activities
                              
                              if (Array.isArray(raw)) {
                                raw.forEach((item: any) => {
                                  const individuals = item?.individuals || 0
                                  if (typeof individuals === 'number' && individuals > 0) {
                                    totalIndividuals += individuals
                                  }
                                })
                              }
                            } catch {
                              // Skip if parsing fails
                            }
                          }
                        })
                        
                        if (totalIndividuals > 0) {
                          return (
                            <div>
                              <div className="font-semibold">{t('f3:target_beneficiaries')}</div>
                              <div className="whitespace-pre-wrap">{totalIndividuals.toLocaleString()}</div>
                            </div>
                          )
                        }
                        return null
                      })()}
                      {(() => {
                        const projects = detail?.projects || (detail?.project ? [detail.project] : [])
                        const projectsWithActivities = projects
                          .map(p => {
                            const errName = p.emergency_rooms?.name || activeMou.err_name
                            return formatProjectSummary(p, errName)
                          })
                          .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
                        
                        if (projectsWithActivities.length > 0) {
                          return (
                            <div>
                              <div className="font-semibold">{t('f3:planned_activities')}</div>
                              <div className="space-y-3 mt-2">
                                {projectsWithActivities.map((summary, idx) => {
                                  const activitiesText = summary.activities
                                    .map(act => `${act.activity}: $${act.cost.toLocaleString()}`)
                                    .join(' | ')
                                  return (
                                    <div key={idx} className="text-sm">
                                      <span className="font-medium">{summary.errName}</span>
                                      {': '}
                                      <span>{activitiesText}</span>
                                      {'. '}
                                      <span className="text-muted-foreground">
                                        Total: ${summary.totalCost.toLocaleString()}, Individuals: {summary.totalIndividuals.toLocaleString()}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}
                      {(aggregatedData.locations.localities || aggregatedData.locations.state) && (
                        <div className="text-xs text-muted-foreground">{t('f3:location', { lng: 'en' })}: {aggregatedData.locations.localities || '-'} / {aggregatedData.locations.state || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{t('f3:shall_partner', { partner: activeMou.partner_name })}</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>{t('f3:partner_provide_sum', { amount: mouTotalFromProjects.toLocaleString() })}</li>
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
                      {(() => {
                        const projects = detail?.projects || (detail?.project ? [detail.project] : [])
                        const uniqueLocalities = new Set<string>()
                        projects.forEach(p => {
                          if (p.locality) uniqueLocalities.add(p.locality)
                        })
                        const localityCount = uniqueLocalities.size
                        const localityList = Array.from(uniqueLocalities).join(', ')
                        const projectText = localityCount === 1 ? 'مشروع' : 'مشاريع'
                        const localityText = localityCount === 1 ? 'منطقة' : 'مناطق'
                        const standardObjective = `${projectText} لتقديم المساعدات الإنسانية عبر ${localityCount} ${localityText}: ${localityList}. فيما يلي ملخص للمشاريع حسب كل غرفة طوارئ.`
                        return (
                          <div>
                            <div className="font-semibold">الأهداف</div>
                            <div className="whitespace-pre-wrap">{standardObjective}</div>
                          </div>
                        )
                      })()}
                      {(() => {
                        const projects = detail?.projects || (detail?.project ? [detail.project] : [])
                        let totalIndividuals = 0
                        
                        projects.forEach(project => {
                          if (project.planned_activities) {
                            try {
                              const raw = typeof project.planned_activities === 'string' 
                                ? JSON.parse(project.planned_activities) 
                                : project.planned_activities
                              
                              if (Array.isArray(raw)) {
                                raw.forEach((item: any) => {
                                  const individuals = item?.individuals || 0
                                  if (typeof individuals === 'number' && individuals > 0) {
                                    totalIndividuals += individuals
                                  }
                                })
                              }
                            } catch {
                              // Skip if parsing fails
                            }
                          }
                        })
                        
                        if (totalIndividuals > 0) {
                          return (
                            <div>
                              <div className="font-semibold">المستفيدون المستهدفون</div>
                              <div className="whitespace-pre-wrap">{totalIndividuals.toLocaleString()}</div>
                            </div>
                          )
                        }
                        return null
                      })()}
                      {(() => {
                        const projects = detail?.projects || (detail?.project ? [detail.project] : [])
                        const projectsWithActivities = projects
                          .map(p => {
                            const errName = p.emergency_rooms?.name_ar || p.emergency_rooms?.name || activeMou.err_name
                            return formatProjectSummary(p, errName)
                          })
                          .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
                        
                        if (projectsWithActivities.length > 0) {
                          return (
                            <div>
                              <div className="font-semibold">الأنشطة المخططة</div>
                              <div className="space-y-3 mt-2">
                                {projectsWithActivities.map((summary, idx) => {
                                  const activitiesText = summary.activities
                                    .map(act => `${act.activity}: $${act.cost.toLocaleString()}`)
                                    .join(' | ')
                                  return (
                                    <div key={idx} className="text-sm">
                                      <span className="font-medium">{summary.errName}</span>
                                      {': '}
                                      <span>{activitiesText}</span>
                                      {'. '}
                                      <span className="text-muted-foreground">
                                        Total: ${summary.totalCost.toLocaleString()}, Individuals: {summary.totalIndividuals.toLocaleString()}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}
                      {(aggregatedData.locations.localities || aggregatedData.locations.state) && (
                        <div className="text-xs text-muted-foreground">الموقع: {aggregatedData.locations.localities || '-'} / {aggregatedData.locations.state || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3" dir="rtl">
                    <div className="font-medium mb-2">تلتزم {activeMou.partner_name}</div>
                    <ul className="list-disc list-inside pr-5 text-sm space-y-1 break-words">
                      <li>تقديم مبلغ قدره ${mouTotalFromProjects.toLocaleString()}.</li>
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
                  <div className="rounded-md border p-3 text-sm">{t('f3:funding_en_desc', { partner: activeMou.partner_name, amount: mouTotalFromProjects.toLocaleString() })}</div>
                  <div className="rounded-md border p-3 text_sm" dir="rtl">{t('f3:funding_ar_desc', { partner: activeMou.partner_name, amount: mouTotalFromProjects.toLocaleString() })}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2" data-mou-subsection="true">5. {t('f3:approved_accounts')}</div>
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
                ) : approvedAccountBlocks.length > 0 ? (
                  <div className="space-y-4">
                    {approvedAccountBlocks.map((accountBlock, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 md:grid-cols-2 gap-4 break-inside-avoid"
                        data-mou-subsection="true"
                      >
                        <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">{accountBlock}</div>
                        <div className="rounded-md border p-3 text-sm whitespace-pre-wrap" dir="rtl">{accountBlock}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap">{t('f3:approved_accounts_en_desc')}</div>
                    <div className="rounded-md border p-3 text-sm whitespace-pre-wrap" dir="rtl">{t('f3:approved_accounts_ar_desc')}</div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border p-4" data-mou-section="true">
                <div className="font-semibold mb-2">6. {t('f3:budget')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="rounded-md border p-3 text-sm">{t('f3:budget_en_desc')}</div>
                  <div className="rounded-md border p-3 text-sm" dir="rtl">{t('f3:budget_ar_desc')}</div>
                </div>
                {aggregatedData.budgetTableData ? (
                  <HierarchicalBudgetTable data={aggregatedData.budgetTableData} forceExpanded={forceBudgetExpanded} />
                ) : aggregatedData.budgetTable && (
                  <div className="mt-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: aggregatedData.budgetTable }} />
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
                    
                    {/* Signatures Section */}
                    <div className="mt-6 pt-4 border-t">
                      <div className="flex items-center justify-between mb-4">
                        <Label className="text-base font-semibold">Signatures</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const currentSignatures = (editingMou.signatures as Signature[]) || []
                            const newSignature: Signature = {
                              id: `temp-${Date.now()}`,
                              name: '',
                              role: '',
                              date: new Date().toISOString().split('T')[0]
                            }
                            setEditingMou({
                              ...editingMou,
                              signatures: [...currentSignatures, newSignature]
                            })
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Signature
                        </Button>
                      </div>
                      
                      <div className="space-y-4">
                        {((editingMou.signatures as Signature[]) || []).map((sig, index) => (
                          <div key={sig.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs">Name / Role</Label>
                                  <Input
                                    value={sig.name}
                                    onChange={(e) => {
                                      const updated = [...((editingMou.signatures as Signature[]) || [])]
                                      updated[index] = { ...updated[index], name: e.target.value }
                                      setEditingMou({ ...editingMou, signatures: updated })
                                    }}
                                    placeholder="e.g., John Doe, Partner Representative"
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Date</Label>
                                  <Input
                                    type="date"
                                    value={sig.date}
                                    onChange={(e) => {
                                      const updated = [...((editingMou.signatures as Signature[]) || [])]
                                      updated[index] = { ...updated[index], date: e.target.value }
                                      setEditingMou({ ...editingMou, signatures: updated })
                                    }}
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const updated = ((editingMou.signatures as Signature[]) || []).filter((_, i) => i !== index)
                                  setEditingMou({ ...editingMou, signatures: updated.length > 0 ? updated : null })
                                }}
                                className="ml-2 text-destructive hover:text-destructive"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        {(!editingMou.signatures || (editingMou.signatures as Signature[]).length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-4">No signatures added yet. Click "Add Signature" to add one.</p>
                        )}
                      </div>
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
                    {/* Signatures */}
                    {activeMou.signatures && (activeMou.signatures as Signature[]).length > 0 ? (
                      <div className="mt-6 pt-4 border-t">
                        <div className="font-semibold mb-4">Signatures</div>
                        {(activeMou.signatures as Signature[]).map((sig, index) => (
                          <div key={sig.id || index} className="mb-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                              <div className="space-y-2">
                                <div className="font-medium text-sm">{sig.name || `Signature ${index + 1}`}{sig.role ? ` (${sig.role})` : ''}</div>
                                <div className="border-b-2 border-gray-400 min-h-[40px] pb-2">
                                  <span className="text-muted-foreground text-sm">Signature line</span>
                                </div>
                              </div>
                              <div className="space-y-2" dir="rtl">
                                <div className="font-medium text-sm">{sig.name || `التوقيع ${index + 1}`}{sig.role ? ` (${sig.role})` : ''}</div>
                                <div className="border-b-2 border-gray-400 min-h-[40px] pb-2">
                                  <span className="text-muted-foreground text-sm">خط التوقيع</span>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">Date</div>
                                <div className="text-xs">{sig.date ? new Date(sig.date).toLocaleDateString() : 'Not set'}</div>
                              </div>
                              <div dir="rtl">
                                <div className="text-xs text-muted-foreground mb-1">التاريخ</div>
                                <div className="text-xs">{sig.date ? new Date(sig.date).toLocaleDateString() : 'غير محدد'}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Fallback to old signature fields for backward compatibility
                      <div className="mt-6 pt-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className="font-medium mb-2">Partner Signature</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.partner_signature || <span className="text-muted-foreground text-sm">Signature</span>}
                            </div>
                          </div>
                          <div dir="rtl">
                            <div className="font-medium mb-2">توقيع الشريك</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.partner_signature || <span className="text-muted-foreground text-sm">التوقيع</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <div className="font-medium mb-2">ERR Signature</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.err_signature || <span className="text-muted-foreground text-sm">Signature</span>}
                            </div>
                          </div>
                          <div dir="rtl">
                            <div className="font-medium mb-2">توقيع غرفة الطوارئ</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.err_signature || <span className="text-muted-foreground text-sm">التوقيع</span>}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="font-medium mb-2">Date of Signature</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.signature_date ? new Date(activeMou.signature_date).toLocaleDateString() : <span className="text-muted-foreground text-sm">Date</span>}
                            </div>
                          </div>
                          <div dir="rtl">
                            <div className="font-medium mb-2">تاريخ التوقيع</div>
                            <div className="border-b-2 border-gray-400 min-h-[40px] pb-1">
                              {activeMou.signature_date ? new Date(activeMou.signature_date).toLocaleDateString() : <span className="text-muted-foreground text-sm">التاريخ</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
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
                      onClick={handleSave}
                      disabled={saving}
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                    {canEditMou && (
                    <Button
                      variant="outline"
                      onClick={startEditMode}
                    >
                      Edit
                    </Button>
                    )}
                    <Button
                  onClick={async () => {
                    try {
                      setExporting(true)
                      // Force budget table to be expanded for PDF
                      setForceBudgetExpanded(true)
                      // Wait a tick for React to re-render with expanded table
                      await new Promise(resolve => setTimeout(resolve, 100))
                      
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
                          // Set CSS variables directly on root element (highest priority)
                          const root = doc.documentElement as HTMLElement
                          root.style.setProperty('--background', '#ffffff')
                          root.style.setProperty('--foreground', '#111111')
                          root.style.setProperty('--card', '#ffffff')
                          root.style.setProperty('--card-foreground', '#111111')
                          root.style.setProperty('--popover', '#ffffff')
                          root.style.setProperty('--popover-foreground', '#111111')
                          root.style.setProperty('--primary', '#111111')
                          root.style.setProperty('--primary-foreground', '#ffffff')
                          root.style.setProperty('--secondary', '#f3f4f6')
                          root.style.setProperty('--secondary-foreground', '#111111')
                          root.style.setProperty('--muted', '#f9fafb')
                          root.style.setProperty('--muted-foreground', '#6b7280')
                          root.style.setProperty('--accent', '#f3f4f6')
                          root.style.setProperty('--accent-foreground', '#111111')
                          root.style.setProperty('--destructive', '#ef4444')
                          root.style.setProperty('--border', '#e5e7eb')
                          root.style.setProperty('--input', '#e5e7eb')
                          root.style.setProperty('--ring', '#6b7280')
                          root.style.setProperty('--chart-1', '#3b82f6')
                          root.style.setProperty('--chart-2', '#10b981')
                          root.style.setProperty('--chart-3', '#f59e0b')
                          root.style.setProperty('--chart-4', '#ef4444')
                          root.style.setProperty('--chart-5', '#8b5cf6')
                          root.style.setProperty('--sidebar', '#ffffff')
                          root.style.setProperty('--sidebar-foreground', '#111111')
                          root.style.setProperty('--sidebar-primary', '#111111')
                          root.style.setProperty('--sidebar-primary-foreground', '#ffffff')
                          root.style.setProperty('--sidebar-accent', '#f3f4f6')
                          root.style.setProperty('--sidebar-accent-foreground', '#111111')
                          root.style.setProperty('--sidebar-border', '#e5e7eb')
                          root.style.setProperty('--sidebar-ring', '#6b7280')
                          
                          // Inject a style tag to override all CSS variables with RGB values
                          const style = doc.createElement('style')
                          style.textContent = `
                            :root {
                              --background: #ffffff !important;
                              --foreground: #111111 !important;
                              --card: #ffffff !important;
                              --card-foreground: #111111 !important;
                              --popover: #ffffff !important;
                              --popover-foreground: #111111 !important;
                              --primary: #111111 !important;
                              --primary-foreground: #ffffff !important;
                              --secondary: #f3f4f6 !important;
                              --secondary-foreground: #111111 !important;
                              --muted: #f9fafb !important;
                              --muted-foreground: #6b7280 !important;
                              --accent: #f3f4f6 !important;
                              --accent-foreground: #111111 !important;
                              --destructive: #ef4444 !important;
                              --border: #e5e7eb !important;
                              --input: #e5e7eb !important;
                              --ring: #6b7280 !important;
                              --chart-1: #3b82f6 !important;
                              --chart-2: #10b981 !important;
                              --chart-3: #f59e0b !important;
                              --chart-4: #ef4444 !important;
                              --chart-5: #8b5cf6 !important;
                              --sidebar: #ffffff !important;
                              --sidebar-foreground: #111111 !important;
                              --sidebar-primary: #111111 !important;
                              --sidebar-primary-foreground: #ffffff !important;
                              --sidebar-accent: #f3f4f6 !important;
                              --sidebar-accent-foreground: #111111 !important;
                              --sidebar-border: #e5e7eb !important;
                              --sidebar-ring: #6b7280 !important;
                            }
                            * {
                              color: #111111 !important;
                              border-color: #e5e7eb !important;
                            }
                            body, html {
                              background-color: #ffffff !important;
                            }
                            .text-muted-foreground {
                              color: #6b7280 !important;
                            }
                            [class*="bg-"] {
                              background-color: #ffffff !important;
                            }
                            [class*="border"] {
                              border-color: #e5e7eb !important;
                            }
                          `
                          doc.head.appendChild(style)
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
                            // Inject a style tag to override all CSS variables with RGB values
                            const style = doc.createElement('style')
                            style.textContent = `
                              :root {
                                --background: #ffffff !important;
                                --foreground: #111111 !important;
                                --card: #ffffff !important;
                                --card-foreground: #111111 !important;
                                --popover: #ffffff !important;
                                --popover-foreground: #111111 !important;
                                --primary: #111111 !important;
                                --primary-foreground: #ffffff !important;
                                --secondary: #f3f4f6 !important;
                                --secondary-foreground: #111111 !important;
                                --muted: #f9fafb !important;
                                --muted-foreground: #6b7280 !important;
                                --accent: #f3f4f6 !important;
                                --accent-foreground: #111111 !important;
                                --destructive: #ef4444 !important;
                                --border: #e5e7eb !important;
                                --input: #e5e7eb !important;
                                --ring: #6b7280 !important;
                              }
                              * {
                                color: #111111 !important;
                                background-color: transparent !important;
                                border-color: #e5e7eb !important;
                              }
                              .text-muted-foreground {
                                color: #6b7280 !important;
                              }
                              [class*="bg-"] {
                                background-color: #ffffff !important;
                              }
                              [class*="border"] {
                                border-color: #e5e7eb !important;
                              }
                            `
                            doc.head.appendChild(style)
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
                                  // Inject a style tag to override all CSS variables with RGB values
                                  const style = doc.createElement('style')
                                  style.textContent = `
                                    :root {
                                      --background: #ffffff !important;
                                      --foreground: #111111 !important;
                                      --card: #ffffff !important;
                                      --card-foreground: #111111 !important;
                                      --popover: #ffffff !important;
                                      --popover-foreground: #111111 !important;
                                      --primary: #111111 !important;
                                      --primary-foreground: #ffffff !important;
                                      --secondary: #f3f4f6 !important;
                                      --secondary-foreground: #111111 !important;
                                      --muted: #f9fafb !important;
                                      --muted-foreground: #6b7280 !important;
                                      --accent: #f3f4f6 !important;
                                      --accent-foreground: #111111 !important;
                                      --destructive: #ef4444 !important;
                                      --border: #e5e7eb !important;
                                      --input: #e5e7eb !important;
                                      --ring: #6b7280 !important;
                                    }
                                    * {
                                      color: #111111 !important;
                                      background-color: transparent !important;
                                      border-color: #e5e7eb !important;
                                    }
                                    .text-muted-foreground {
                                      color: #6b7280 !important;
                                    }
                                    [class*="bg-"] {
                                      background-color: #ffffff !important;
                                    }
                                    [class*="border"] {
                                      border-color: #e5e7eb !important;
                                    }
                                  `
                                  doc.head.appendChild(style)
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
                          
                          // If no subsections, split the section canvas into chunks
                          const maxChunkHeight = pageHeight - margin * 2
                          const totalChunks = Math.ceil(drawH / maxChunkHeight)
                          
                          for (let chunk = 0; chunk < totalChunks; chunk++) {
                            const chunkStartY = (chunk * maxChunkHeight) / ratio
                            const chunkHeight = Math.min(maxChunkHeight / ratio, secH - chunkStartY)
                            
                            // Create a temporary canvas for this chunk
                            const chunkCanvas = document.createElement('canvas')
                            chunkCanvas.width = secW
                            chunkCanvas.height = chunkHeight
                            const chunkCtx = chunkCanvas.getContext('2d')
                            if (chunkCtx && secCanvas) {
                              // Draw the portion of the section canvas we need
                              // secCanvas is a canvas element from html2canvas
                              // Copy from secCanvas starting at chunkStartY, taking chunkHeight pixels
                              chunkCtx.drawImage(secCanvas as HTMLCanvasElement, 0, chunkStartY, secW, chunkHeight, 0, 0, secW, chunkHeight)
                              const chunkImg = chunkCanvas.toDataURL('image/png')
                              const chunkDrawH = chunkHeight * ratio
                              
                              if (currentY + chunkDrawH > pageHeight - margin) {
                                pdf.addPage()
                                currentY = margin
                              }
                              
                              pdf.addImage(chunkImg, 'PNG', margin, currentY, drawW, chunkDrawH)
                              currentY += chunkDrawH
                              
                              // Add small gap between chunks (except last)
                              if (chunk < totalChunks - 1) {
                                currentY += 4
                              }
                            }
                          }
                          currentY += 12 // gap after section
                        } else {
                          pdf.addImage(secImg, 'PNG', margin, currentY, drawW, drawH)
                          currentY += drawH + 12 // gap between sections
                        }
                      }
                      const blob = pdf.output('bloburl')
                      window.open(blob, '_blank')
                    } catch (e) {
                      console.error('PDF export failed', e)
                    } finally {
                      setExporting(false)
                      // Reset force expansion after PDF generation
                      setForceBudgetExpanded(false)
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
            ) })()}
        </DialogContent>
      </Dialog>
  )
}
