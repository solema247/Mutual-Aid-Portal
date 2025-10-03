'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('management.detail_modal.title')}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">{t('management.detail_modal.loading')}</div>
        ) : !project ? (
          <div className="py-8 text-center text-muted-foreground">{t('management.detail_modal.no_data')}</div>
        ) : (
          <div className="space-y-6">
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

            {/* F4 summaries */}
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


