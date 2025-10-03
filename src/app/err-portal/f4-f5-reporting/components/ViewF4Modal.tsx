'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface ViewF4ModalProps {
  summaryId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ViewF4Modal({ summaryId, open, onOpenChange }: ViewF4ModalProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any | null>(null)

  useEffect(() => {
    if (!open || !summaryId) { setData(null); return }
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/f4/summary/${summaryId}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Failed to load summary')
        setData(j)
      } catch (e) {
        console.error(e)
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, summaryId])

  const summary = data?.summary
  const project = summary?.err_projects
  const room = project?.emergency_rooms
  const expenses = data?.expenses || []
  const attachments = data?.attachments || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>F4 Report Details</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : !summary ? (
          <div className="py-10 text-center text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-6">
            {/* Project / F1 context */}
            <div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ERR</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{room?.name || room?.name_ar || room?.err_code || project?.err_id || '-'}</div>
                </div>
                <div>
                  <Label>State</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.state || '-'}</div>
                </div>
              </div>
              <div className="mt-3">
                <Label>Project Objectives</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.project_objectives || '-'}</div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Report Date</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{summary?.report_date ? new Date(summary.report_date).toLocaleDateString() : '-'}</div>
              </div>
              <div>
                <Label>Remainder</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(summary?.remainder || 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>Total Grant</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(summary?.total_grant || 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>Total Expenses</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(summary?.total_expenses || 0).toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Excess Expenses (How covered?)</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.excess_expenses || '-'}</div>
              </div>
              <div>
                <Label>Surplus Use</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.surplus_use || '-'}</div>
              </div>
              <div>
                <Label>Lessons Learned</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.lessons || '-'}</div>
              </div>
              <div>
                <Label>Training Needs</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.training || '-'}</div>
              </div>
            </div>

            {/* Expenses */}
            <div>
              <Label>Expenses</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Date</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Seller</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-muted-foreground text-center">No expenses</TableCell></TableRow>
                  ) : expenses.map((e:any)=> (
                    <TableRow key={e.expense_id}>
                      <TableCell>{e.expense_activity || '-'}</TableCell>
                      <TableCell>{Number(e.expense_amount || 0).toLocaleString()}</TableCell>
                      <TableCell>{e.payment_date ? new Date(e.payment_date).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{e.payment_method || '-'}</TableCell>
                      <TableCell>{e.receipt_no || '-'}</TableCell>
                      <TableCell>{e.seller || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Attachments */}
            <div>
              <Label>Attachments</Label>
              <div className="text-sm">
                {(attachments || []).length === 0 ? '—' : attachments.map((a:any, i:number)=> (
                  <div key={i}>{a.file_key}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


