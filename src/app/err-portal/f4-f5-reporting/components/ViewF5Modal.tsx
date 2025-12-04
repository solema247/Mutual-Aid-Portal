'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface ViewF5ModalProps {
  reportId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export default function ViewF5Modal({ reportId, open, onOpenChange, onSaved }: ViewF5ModalProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any | null>(null)

  useEffect(() => {
    if (!open || !reportId) { setData(null); return }
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/f5/report/${reportId}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Failed to load report')
        setData(j)
      } catch (e) {
        console.error(e)
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, reportId])

  const report = data?.report
  const project = report?.err_projects
  const room = project?.emergency_rooms
  const reach = data?.reach || []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>F5 Report Details</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : !report ? (
          <div className="py-10 text-center text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-6">
            {/* Project context */}
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

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Report Date</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{report?.report_date ? new Date(report.report_date).toLocaleDateString() : '-'}</div>
              </div>
              <div>
                <Label>Reporting Person</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{report?.reporting_person || '-'}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Positive Changes</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.positive_changes || '-'}</div>
              </div>
              <div>
                <Label>Negative Results</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.negative_results || '-'}</div>
              </div>
              <div>
                <Label>Unexpected Results</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.unexpected_results || '-'}</div>
              </div>
              <div>
                <Label>Lessons Learned</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.lessons_learned || '-'}</div>
              </div>
              <div className="md:col-span-2">
                <Label>Suggestions</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.suggestions || '-'}</div>
              </div>
            </div>

            {/* Activities Table */}
            <div>
              <Label>Implemented Activities</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity Name</TableHead>
                    <TableHead>Goal/Details of Activity</TableHead>
                    <TableHead>Implementation Location</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Beneficiaries (Individuals)</TableHead>
                    <TableHead>Beneficiaries (Families)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reach.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No activities</TableCell></TableRow>
                  ) : reach.map((e:any)=> (
                    <TableRow key={e.id}>
                      <TableCell>{e.activity_name || '-'}</TableCell>
                      <TableCell>{e.activity_goal || '-'}</TableCell>
                      <TableCell>{e.location || '-'}</TableCell>
                      <TableCell>{e.start_date || '-'}</TableCell>
                      <TableCell>{e.end_date || '-'}</TableCell>
                      <TableCell>{Number(e.individual_count ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{Number(e.household_count ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Demographics Breakdown Table */}
            <div>
              <Label>Additional Beneficiary Breakdown</Label>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Activity</TableHead>
                    <TableHead>Male</TableHead>
                    <TableHead>Female</TableHead>
                    <TableHead>Male &lt;18</TableHead>
                    <TableHead>Female &lt;18</TableHead>
                    <TableHead>People with Disabilities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reach.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No demographic breakdowns available</TableCell></TableRow>
                  ) : reach.map((activity:any)=> (
                    <TableRow key={activity.id}>
                      <TableCell>{activity.activity_name || '-'}</TableCell>
                      <TableCell>{Number(activity.male_count ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{Number(activity.female_count ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{Number(activity.under18_male ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{Number(activity.under18_female ?? 0).toLocaleString()}</TableCell>
                      <TableCell>{Number(activity.special_needs ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


