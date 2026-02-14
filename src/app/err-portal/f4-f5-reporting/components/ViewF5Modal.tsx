'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { FileText } from 'lucide-react'

interface ViewF5ModalProps {
  reportId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export default function ViewF5Modal({ reportId, open, onOpenChange, onSaved }: ViewF5ModalProps) {
  const { can } = useAllowedFunctions()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<any | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState<any | null>(null)
  const [reachDraft, setReachDraft] = useState<any[]>([])

  useEffect(() => {
    if (!open || !reportId) { 
      setData(null)
      setIsEditing(false)
      setSummaryDraft(null)
      setReachDraft([])
      return 
    }
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/f5/report/${reportId}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Failed to load report')
        setData(j)
        
        // Initialize draft data
        const report = j.report
        setSummaryDraft({
          report_date: report?.report_date || '',
          reporting_person: report?.reporting_person || '',
          positive_changes: report?.positive_changes || '',
          negative_results: report?.negative_results || '',
          unexpected_results: report?.unexpected_results || '',
          lessons_learned: report?.lessons_learned || '',
          suggestions: report?.suggestions || ''
        })
        
        // Initialize reach draft
        setReachDraft((j.reach || []).map((r: any) => ({
          id: r.id,
          activity_name: r.activity_name || '',
          activity_goal: r.activity_goal || '',
          location: r.location || '',
          start_date: r.start_date || '',
          end_date: r.end_date || '',
          individual_count: r.individual_count ?? null,
          household_count: r.household_count ?? null,
          male_count: r.male_count ?? null,
          female_count: r.female_count ?? null,
          under18_male: r.under18_male ?? null,
          under18_female: r.under18_female ?? null,
          people_with_disabilities: r.people_with_disabilities ?? null
        })))
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
  const reach = isEditing ? reachDraft : (data?.reach || [])
  const files = data?.files || []

  const handleSave = async () => {
    if (!reportId || !summaryDraft) return
    setSaving(true)
    try {
      const res = await fetch('/api/f5/update', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          report_id: reportId, 
          summary: summaryDraft, 
          reach: reachDraft 
        }) 
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')
      
      setIsEditing(false)
      if (onSaved) onSaved()
      // Reload data
      const reloadRes = await fetch(`/api/f5/report/${reportId}`)
      const reloadJson = await reloadRes.json()
      if (reloadRes.ok) {
        setData(reloadJson)
        const report = reloadJson.report
        setSummaryDraft({
          report_date: report?.report_date || '',
          reporting_person: report?.reporting_person || '',
          positive_changes: report?.positive_changes || '',
          negative_results: report?.negative_results || '',
          unexpected_results: report?.unexpected_results || '',
          lessons_learned: report?.lessons_learned || '',
          suggestions: report?.suggestions || ''
        })
        setReachDraft((reloadJson.reach || []).map((r: any) => ({
          id: r.id,
          activity_name: r.activity_name || '',
          activity_goal: r.activity_goal || '',
          location: r.location || '',
          start_date: r.start_date || '',
          end_date: r.end_date || '',
          individual_count: r.individual_count ?? null,
          household_count: r.household_count ?? null,
          male_count: r.male_count ?? null,
          female_count: r.female_count ?? null,
          under18_male: r.under18_male ?? null,
          under18_female: r.under18_female ?? null,
          people_with_disabilities: r.people_with_disabilities ?? null
        })))
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update F5')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>F5 Report Details</DialogTitle>
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} disabled={!can('f5_save') && !can('f5_adjust')} title={(!can('f5_save') && !can('f5_adjust')) ? 'You do not have permission' : undefined}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || (!can('f5_save') && !can('f5_adjust'))} title={(!can('f5_save') && !can('f5_adjust')) ? 'You do not have permission' : undefined}>{saving ? 'Saving...' : 'Save'}</Button>
              </div>
            )}
          </div>
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
                {isEditing ? (
                  <Input 
                    type="date" 
                    value={summaryDraft?.report_date ? (typeof summaryDraft.report_date === 'string' ? summaryDraft.report_date.split('T')[0] : new Date(summaryDraft.report_date).toISOString().split('T')[0]) : ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} 
                  />
                ) : (
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{report?.report_date ? new Date(report.report_date).toLocaleDateString() : '-'}</div>
                )}
              </div>
              <div>
                <Label>Reporting Person</Label>
                {isEditing ? (
                  <Input 
                    value={summaryDraft?.reporting_person || ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), reporting_person: e.target.value }))} 
                  />
                ) : (
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{report?.reporting_person || '-'}</div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Positive Changes</Label>
                {isEditing ? (
                  <Input 
                    value={summaryDraft?.positive_changes || ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), positive_changes: e.target.value }))} 
                  />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.positive_changes || '-'}</div>
                )}
              </div>
              <div>
                <Label>Negative Results</Label>
                {isEditing ? (
                  <Input 
                    value={summaryDraft?.negative_results || ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), negative_results: e.target.value }))} 
                  />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.negative_results || '-'}</div>
                )}
              </div>
              <div>
                <Label>Unexpected Results</Label>
                {isEditing ? (
                  <Input 
                    value={summaryDraft?.unexpected_results || ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), unexpected_results: e.target.value }))} 
                  />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.unexpected_results || '-'}</div>
                )}
              </div>
              <div>
                <Label>Lessons Learned</Label>
                {isEditing ? (
                  <Input 
                    value={summaryDraft?.lessons_learned || ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons_learned: e.target.value }))} 
                  />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.lessons_learned || '-'}</div>
                )}
              </div>
              <div className="md:col-span-2">
                <Label>Suggestions</Label>
                {isEditing ? (
                  <Input 
                    value={summaryDraft?.suggestions || ''} 
                    onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), suggestions: e.target.value }))} 
                  />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{report?.suggestions || '-'}</div>
                )}
              </div>
            </div>

            {/* Activities Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Implemented Activities</Label>
                {isEditing && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReachDraft(prev => ([...prev, {
                      activity_name: '',
                      activity_goal: '',
                      location: '',
                      start_date: '',
                      end_date: '',
                      individual_count: null,
                      household_count: null,
                      male_count: null,
                      female_count: null,
          under18_male: null,
          under18_female: null,
          people_with_disabilities: null
        }]))}
                  >Add Activity</Button>
                )}
              </div>
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
                    {isEditing && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reach.length === 0 ? (
                    <TableRow><TableCell colSpan={isEditing ? 8 : 7} className="text-center text-muted-foreground">No activities</TableCell></TableRow>
                  ) : reach.map((e:any, idx:number)=> (
                    <TableRow key={e.id || idx}>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" value={e.activity_name || ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_name: ev.target.value}; setReachDraft(arr)
                          }} />
                        ) : (
                          e.activity_name || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" value={e.activity_goal || ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_goal: ev.target.value}; setReachDraft(arr)
                          }} />
                        ) : (
                          e.activity_goal || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" value={e.location || ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], location: ev.target.value}; setReachDraft(arr)
                          }} />
                        ) : (
                          e.location || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="date" value={e.start_date || ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], start_date: ev.target.value}; setReachDraft(arr)
                          }} />
                        ) : (
                          e.start_date || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="date" value={e.end_date || ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], end_date: ev.target.value}; setReachDraft(arr)
                          }} />
                        ) : (
                          e.end_date || '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={e.individual_count ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], individual_count: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(e.individual_count ?? 0).toLocaleString()
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={e.household_count ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], household_count: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(e.household_count ?? 0).toLocaleString()
                        )}
                      </TableCell>
                      {isEditing && (
                        <TableCell className="text-right">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              const arr = [...reachDraft]
                              arr.splice(idx, 1)
                              setReachDraft(arr)
                            }}
                          >Delete</Button>
                        </TableCell>
                      )}
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
                  ) : reach.map((activity:any, idx:number)=> (
                    <TableRow key={activity.id || idx}>
                      <TableCell>{activity.activity_name || '-'}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={activity.male_count ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], male_count: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(activity.male_count ?? 0).toLocaleString()
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={activity.female_count ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], female_count: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(activity.female_count ?? 0).toLocaleString()
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={activity.under18_male ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_male: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(activity.under18_male ?? 0).toLocaleString()
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={activity.under18_female ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_female: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(activity.under18_female ?? 0).toLocaleString()
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input className="h-8" type="number" value={activity.people_with_disabilities ?? ''} onChange={(ev)=>{
                            const arr=[...reachDraft]; arr[idx]={...arr[idx], people_with_disabilities: parseInt(ev.target.value)||0}; setReachDraft(arr)
                          }} />
                        ) : (
                          Number(activity.people_with_disabilities ?? 0).toLocaleString()
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* File Attachments */}
            <div>
              <Label>Attachments</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {files.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : files.map((file:any, i:number)=> (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!file.file_url) return
                      try {
                        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(file.file_url)}`)
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
                        link.download = file.file_name || file.file_url.split('/').pop() || 'file'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      } catch (error) {
                        console.error('Error opening file:', error)
                        alert(`Failed to open file`)
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    {file.file_name || file.file_url.split('/').pop() || 'Original File'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


