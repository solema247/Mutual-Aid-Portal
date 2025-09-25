'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface UploadF5ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export default function UploadF5Modal({ open, onOpenChange, onSaved }: UploadF5ModalProps) {
  const [states, setStates] = useState<string[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; label: string }>>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; label: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [reportDate, setReportDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'select'|'preview'>('select')
  const [summaryDraft, setSummaryDraft] = useState<any | null>(null)
  const [reachDraft, setReachDraft] = useState<any[]>([])
  const [tempKey, setTempKey] = useState<string>('')

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('state')
      const uniq = Array.from(new Set(((data as any[]) || []).map((r:any)=>r.state).filter(Boolean))) as string[]
      setStates(uniq)
    })()
  }, [open])

  useEffect(() => {
    if (!selectedState) { setRooms([]); setSelectedRoomId(''); setProjects([]); setProjectId(''); return }
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('emergency_room_id, emergency_rooms (id, name, name_ar, err_code)')
        .eq('state', selectedState)
      const map = new Map<string, { id: string; label: string }>()
      for (const r of (data as any[]) || []) {
        const room = r.emergency_rooms
        if (room?.id && !map.has(room.id)) {
          const label = room.name || room.name_ar || room.err_code || room.id
          map.set(room.id, { id: room.id, label })
        }
      }
      setRooms(Array.from(map.values()))
      setSelectedRoomId('')
      setProjects([])
      setProjectId('')
    })()
  }, [selectedState])

  useEffect(() => {
    if (!selectedRoomId) { setProjects([]); setProjectId(''); return }
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('id, project_objectives, submitted_at')
        .eq('emergency_room_id', selectedRoomId)
        .order('submitted_at', { ascending: false })
      setProjects(((data as any[]) || []).map((p:any)=> ({ id: p.id, label: p.project_objectives || p.id })))
    })()
  }, [selectedRoomId])

  const handleUploadAndParse = async () => {
    if (!projectId || !file) return
    setIsLoading(true)
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      const initRes = await fetch('/api/f4/upload/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, ext }) })
      const initJson = await initRes.json()
      if (!initRes.ok) throw new Error(initJson.error || 'Init failed')
      const key = initJson.file_key_temp as string
      setTempKey(key)
      const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
      if (upErr) throw upErr
      const parseRes = await fetch('/api/f5/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, file_key_temp: key }) })
      const parseJson = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseJson.error || 'Parse failed')
      setSummaryDraft({ ...(parseJson.summaryDraft || {}), report_date: reportDate || (parseJson.summaryDraft?.report_date || '') })
      setReachDraft(parseJson.reachDraft || [])
      setStep('preview')
    } catch (e) {
      console.error(e)
      alert('Failed to process file')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!projectId || !summaryDraft) return
    setIsLoading(true)
    try {
      const summaryToSave = { ...summaryDraft }
      const res = await fetch('/api/f5/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, summary: summaryToSave, reach: reachDraft, file_key_temp: tempKey }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      onOpenChange(false)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Failed to save F5')
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setProjectId('')
    setFile(null)
    setReportDate('')
    setSummaryDraft(null)
    setReachDraft([])
    setStep('select')
    setTempKey('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto select-text">
        <DialogHeader>
          <DialogTitle>Upload F5 Program Report</DialogTitle>
        </DialogHeader>
        {step === 'select' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>State</Label>
                <Select value={selectedState} onValueChange={(v)=>{ setSelectedState(v); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ERR (with projects)</Label>
                <Select value={selectedRoomId} onValueChange={(v)=>{ setSelectedRoomId(v); }} disabled={!selectedState}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select ERR" /></SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!selectedRoomId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select project (by objectives)" /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Report Date</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div>
              <Label>Report File (PDF/Image)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleUploadAndParse} disabled={!projectId || !file || isLoading}>{isLoading ? 'Processing…' : 'Process'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 select-text">
            {/* Summary */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Report Date</Label>
                  <Input type="date" value={summaryDraft?.report_date ?? reportDate} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Reporting Person</Label>
                  <Input value={summaryDraft?.reporting_person ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), reporting_person: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Positive Changes</Label>
                  <Input value={summaryDraft?.positive_changes ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), positive_changes: e.target.value }))} />
                </div>
                <div>
                  <Label>Negative Results</Label>
                  <Input value={summaryDraft?.negative_results ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), negative_results: e.target.value }))} />
                </div>
                <div>
                  <Label>Unexpected Results</Label>
                  <Input value={summaryDraft?.unexpected_results ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), unexpected_results: e.target.value }))} />
                </div>
                <div>
                  <Label>Lessons Learned</Label>
                  <Input value={summaryDraft?.lessons_learned ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons_learned: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>Suggestions</Label>
                  <Input value={summaryDraft?.suggestions ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), suggestions: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Reach Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Implemented Activities (Reach)</Label>
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
                    is_draft: true
                  }]))}
                >Add row</Button>
              </div>
              <div className="border rounded overflow-hidden select-text">
                {reachDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No rows parsed</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-1 px-2 text-xs">Activity Name</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Objective / Details</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Location</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Start</TableHead>
                        <TableHead className="py-1 px-2 text-xs">End</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Individuals</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Families</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Male</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Female</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Boys &lt;18</TableHead>
                        <TableHead className="py-1 px-2 text-xs">Girls &lt;18</TableHead>
                        <TableHead className="py-1 px-2 text-xs text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reachDraft.map((row, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2"><Input className="h-8" value={row.activity_name || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_name: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" value={row.activity_goal || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_goal: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" value={row.location || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], location: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="date" value={row.start_date || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], start_date: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="date" value={row.end_date || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], end_date: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={row.individual_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], individual_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={row.household_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], household_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={row.male_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], male_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={row.female_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], female_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={row.under18_male ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_male: parseInt(e.target.value)||0}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={row.under18_female ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_female: parseInt(e.target.value)||0}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button variant="destructive" size="sm" onClick={()=>{ const arr=[...reachDraft]; arr.splice(idx,1); setReachDraft(arr) }}>Delete</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={()=>setStep('select')}>Back</Button>
              <Button onClick={handleSave} disabled={isLoading}>{isLoading ? 'Saving…' : 'Save F5'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


