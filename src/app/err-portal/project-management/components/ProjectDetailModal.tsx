'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface ProjectDetailModalProps {
  projectId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ProjectDetailModal({ projectId, open, onOpenChange }: ProjectDetailModalProps) {
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
          <DialogTitle>Project Detail</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : !project ? (
          <div className="py-8 text-center text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>ERR</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{room?.name || room?.name_ar || room?.err_code || '-'}</div>
              </div>
              <div>
                <Label>State</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.state || '-'}</div>
              </div>
            </div>
            <div>
              <Label>Project Objectives</Label>
              <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.project_objectives || '-'}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Intended Beneficiaries</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.intended_beneficiaries || '-'}</div>
              </div>
              <div>
                <Label>Estimated Beneficiaries</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.estimated_beneficiaries ?? '-'}</div>
              </div>
            </div>

            {/* F4 summaries */}
            <div>
              <Label>F4 Reports</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Date</TableHead>
                    <TableHead className="text-right">Total Grant</TableHead>
                    <TableHead className="text-right">Total Expenses</TableHead>
                    <TableHead className="text-right">Remainder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No reports</TableCell></TableRow>
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
                <Label>Latest F4 Expenses</Label>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Seller</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(summaries[0].expenses || []).length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No expenses</TableCell></TableRow>
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


