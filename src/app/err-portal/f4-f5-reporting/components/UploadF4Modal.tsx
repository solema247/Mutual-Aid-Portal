'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

interface UploadF4ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export default function UploadF4Modal({ open, onOpenChange, onSaved }: UploadF4ModalProps) {
  const [projects, setProjects] = useState<Array<{ id: string; label: string }>>([])
  const [projectId, setProjectId] = useState('')
  const [projectMeta, setProjectMeta] = useState<any | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [reportDate, setReportDate] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'select'|'preview'>('select')
  const [summaryDraft, setSummaryDraft] = useState<any | null>(null)
  const [expensesDraft, setExpensesDraft] = useState<any[]>([])
  const [tempKey, setTempKey] = useState<string>('')
  const [fxRate, setFxRate] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('id, status, submitted_at, emergency_room_id, emergency_rooms (err_code, name, name_ar)')
        .eq('status', 'active')
        .order('submitted_at', { ascending: false })
      setProjects(((data as any[]) || []).map((p: any) => {
        const label = p.emergency_rooms?.err_code || p.emergency_rooms?.name_ar || p.emergency_rooms?.name || p.id
        return { id: p.id, label }
      }))
    })()
  }, [open])

  // Load selected project meta
  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) { setProjectMeta(null); return }
      const { data, error } = await supabase
        .from('err_projects')
        .select(`
          id,
          project_objectives,
          intended_beneficiaries,
          estimated_beneficiaries,
          expenses,
          planned_activities,
          emergency_rooms (err_code, name, name_ar)
        `)
        .eq('id', projectId)
        .single()
      if (error) { console.error('loadProject meta', error); setProjectMeta(null); return }
      const plannedArr = Array.isArray((data as any)?.planned_activities)
        ? (data as any).planned_activities
        : (typeof (data as any)?.planned_activities === 'string' ? JSON.parse((data as any)?.planned_activities || '[]') : [])
      const fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
        const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
        return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
      }, 0)
      // Total Grant must come solely from planned_activities (F1 plan of record)
      const grantSum = fromPlanned
      const room = (data as any)?.emergency_rooms
      const roomLabel = room?.err_code || room?.name_ar || room?.name || ''
      setProjectMeta({
        roomLabel,
        project_objectives: (data as any)?.project_objectives || '',
        beneficiaries: (data as any)?.intended_beneficiaries || (data as any)?.estimated_beneficiaries || '',
        total_grant_from_project: grantSum
      })
    }
    loadProject()
  }, [projectId])

  const handleUploadAndParse = async () => {
    if (!projectId || !file) return
    setIsLoading(true)
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
      // init temp key
      const initRes = await fetch('/api/f4/upload/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, ext }) })
      const initJson = await initRes.json()
      if (!initRes.ok) throw new Error(initJson.error || 'Init failed')
      const key = initJson.file_key_temp as string
      setTempKey(key)
      // upload file to storage
      const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
      if (upErr) throw upErr
      // parse
      const parseRes = await fetch('/api/f4/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, file_key_temp: key }) })
      const parseJson = await parseRes.json()
      if (!parseRes.ok) throw new Error(parseJson.error || 'Parse failed')
      setSummaryDraft({ ...(parseJson.summaryDraft || {}), report_date: reportDate || (parseJson.summaryDraft?.report_date || '') })
      setExpensesDraft((parseJson.expensesDraft || []).map((ex: any) => ({
        ...ex,
        // initialize display amount to SDG if present, else fallback to USD
        expense_amount: ex.expense_amount_sdg ?? ex.expense_amount ?? 0
      })))
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
      const totalFromTable = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)
      const remainderComputed = (projectMeta?.total_grant_from_project || 0) - totalFromTable
      const summaryToSave = {
        ...summaryDraft,
        total_grant: projectMeta?.total_grant_from_project ?? null,
        total_expenses: totalFromTable,
        remainder: remainderComputed
      }
      const res = await fetch('/api/f4/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, summary: summaryToSave, expenses: expensesDraft, file_key_temp: tempKey }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      onOpenChange(false)
      onSaved()
    } catch (e) {
      console.error(e)
      alert('Failed to save F4')
    } finally {
      setIsLoading(false)
    }
  }

  const reset = () => {
    setProjectId('')
    setFile(null)
    setReportDate('')
    setSummaryDraft(null)
    setExpensesDraft([])
    setStep('select')
    setTempKey('')
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[85vh] overflow-y-auto select-text">
        <DialogHeader>
          <DialogTitle>Upload F4 Financial Report</DialogTitle>
        </DialogHeader>
        {step === 'select' ? (
          <div className="space-y-4">
            <div>
              <Label>Project (Active)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Report Date</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div>
              <Label>Summary File (PDF/Image)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleUploadAndParse} disabled={!projectId || !file || isLoading}>{isLoading ? 'Processing…' : 'Process'}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 select-text">
            {/* Summary Header */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ERR Room</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{projectMeta?.roomLabel || '-'}</div>
                </div>
                <div>
                  <Label>Report Date</Label>
                  <Input type="date" value={summaryDraft?.report_date ?? reportDate} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Project Activities</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{projectMeta?.project_objectives || '-'}</div>
              </div>
              <div>
                <Label>Beneficiaries</Label>
                <Input value={summaryDraft?.beneficiaries ?? projectMeta?.beneficiaries ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), beneficiaries: e.target.value }))} />
              </div>
              {/* FX Rate (moved here) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>FX Rate (SDG per 1 USD)</Label>
                  <Input type="number" value={fxRate ?? ''} onChange={(e)=>{
                    const v = parseFloat(e.target.value)
                    setFxRate(isNaN(v) ? null : v)
                    if (!isNaN(v) && v > 0) {
                      setExpensesDraft(prev => prev.map((ex:any)=>{
                        const sdg = ex.expense_amount_sdg ?? ex.expense_amount
                        return {
                          ...ex,
                          expense_amount: typeof sdg === 'number' ? +(sdg / v).toFixed(2) : ex.expense_amount
                        }
                      }))
                    }
                  }} placeholder="e.g. 3200" />
                </div>
              </div>
            </div>

            {/* Expenses (move above Financials) */}
            <div>
              <Label>Expenses</Label>
              <div className="border rounded overflow-hidden select-text">
                {expensesDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No expenses parsed</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[16%] py-1 px-2 text-xs">Activity</TableHead>
                        <TableHead className="w-[24%] py-1 px-2 text-xs">Description</TableHead>
                        <TableHead className="w-[14%] py-1 px-2 text-right text-xs">Amount</TableHead>
                        <TableHead className="w-[14%] py-1 px-2 text-xs">Payment Date</TableHead>
                        <TableHead className="w-[12%] py-1 px-2 text-xs">Method</TableHead>
                        <TableHead className="w-[12%] py-1 px-2 text-xs">Receipt No.</TableHead>
                        <TableHead className="w-[18%] py-1 px-2 text-xs">Seller</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expensesDraft.map((ex, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder="Activity" value={ex.expense_activity || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_activity: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder="Description" value={ex.expense_description || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_description: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Input className="h-8" type="number" placeholder="Amount" value={ex.expense_amount ?? ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_amount: parseFloat(e.target.value)||0}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" type="date" placeholder="Payment Date" value={ex.payment_date || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_date: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder="Method" value={ex.payment_method || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_method: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder="Receipt No." value={ex.receipt_no || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], receipt_no: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder="Seller" value={ex.seller || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], seller: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            {/* Financials */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Grant</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{(projectMeta?.total_grant_from_project ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>Total Expenses (from table)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (ex.expense_amount || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>Remainder</Label>
                <Input type="number" value={(projectMeta?.total_grant_from_project || 0) - expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)} readOnly />
              </div>
              <div>
                <Label>Total Other Sources</Label>
                <Input type="number" value={summaryDraft?.total_other_sources ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), total_other_sources: parseFloat(e.target.value)||0 }))} />
              </div>
              <div className="col-span-2">
                <Label>Excess Expenses (How covered?)</Label>
                <Input value={summaryDraft?.excess_expenses ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), excess_expenses: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Surplus Use</Label>
                <Input value={summaryDraft?.surplus_use ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), surplus_use: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Lessons Learned</Label>
                <Input value={summaryDraft?.lessons ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Training Needs</Label>
                <Input value={summaryDraft?.training ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), training: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={()=>setStep('select')}>Back</Button>
              <Button onClick={handleSave} disabled={isLoading}>{isLoading ? 'Saving…' : 'Save F4'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


