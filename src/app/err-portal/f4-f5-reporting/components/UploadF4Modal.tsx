'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CollapsibleRow } from '@/components/ui/collapsible'

interface UploadF4ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  initialProjectId?: string | null
}

export default function UploadF4Modal({ open, onOpenChange, onSaved, initialProjectId }: UploadF4ModalProps) {
  const { t } = useTranslation(['f4f5'])
  const [states, setStates] = useState<string[]>([])
  const [selectedState, setSelectedState] = useState('')
  const [rooms, setRooms] = useState<Array<{ id: string; label: string }>>([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
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
  const [fileUrl, setFileUrl] = useState<string>('')
  const [rawOcr, setRawOcr] = useState<string>('')
  const [aiOutput, setAiOutput] = useState<any | null>(null)
  const [minimized, setMinimized] = useState(false)
  const isMinimizingRef = useRef(false)
  const isRestoringRef = useRef(false)
  const [isRestoring, setIsRestoring] = useState(false)

  useEffect(() => {
    if (!open) return
    ;(async () => {
      // Load distinct states with active projects
      const { data } = await supabase
        .from('err_projects')
        .select('state')
        .eq('status', 'active')
      const uniq = Array.from(new Set(((data as any[]) || []).map((r:any)=>r.state).filter(Boolean))) as string[]
      setStates(uniq)
    })()
  }, [open])

  // Restore from minimized snapshot if present
  useEffect(() => {
    if (!open) return
    // If opening fresh (not via restore flags), clear any stale snapshot and reset state
    try {
      const sp = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null
      const hasRestoreParam = sp?.get('restore')
      const hasLocalRestore = (typeof window !== 'undefined') ? (window.localStorage.getItem('err_restore') || window.localStorage.getItem('err_minimized_modal')) : null
      if (!hasRestoreParam && !hasLocalRestore) {
        try { window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}
        // Ensure fresh state for new uploads - reset all form fields
        setStep('select')
        setProjectId('')
        setFile(null)
        setReportDate('')
        setSelectedState('')
        setSelectedRoomId('')
        setSummaryDraft(null)
        setExpensesDraft([])
        setTempKey('')
        setFileUrl('')
        setRawOcr('')
        setAiOutput(null)
        return
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem('err_minimized_payload')
      const type = window.localStorage.getItem('err_minimized_modal')
      if (raw && type === 'f4') {
        const p = JSON.parse(raw)
        if (p?.type === 'f4') {
          isRestoringRef.current = true
          setIsRestoring(true)
          if (p.step) setStep(p.step)
          if (p.summaryDraft) setSummaryDraft(p.summaryDraft)
          if (Array.isArray(p.expensesDraft)) setExpensesDraft(p.expensesDraft)
          if (p.projectId) setProjectId(p.projectId)
          if (p.reportDate) setReportDate(p.reportDate)
          if (p.selectedState) setSelectedState(p.selectedState)
          if (p.selectedRoomId) setSelectedRoomId(p.selectedRoomId)
          if (p.tempKey) {
            setTempKey(p.tempKey)
            ;(async () => {
              try {
                const { data: signed } = await supabase.storage.from('images').createSignedUrl(p.tempKey, 3600)
                if (signed?.signedUrl) setFileUrl(signed.signedUrl)
              } catch {}
            })()
          } else if (p.fileUrl) {
            setFileUrl(p.fileUrl)
          }
          try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}
          // Reset restore flag after a brief delay to allow all state updates to propagate
          setTimeout(() => { 
            isRestoringRef.current = false
            setIsRestoring(false)
          }, 500)
        }
      }
    } catch {}
  }, [open])

  // Auto-select project when initialProjectId is provided
  useEffect(() => {
    if (!open || !initialProjectId) return
    ;(async () => {
      try {
        const { data: projectData, error } = await supabase
          .from('err_projects')
          .select('id, state, emergency_room_id, emergency_rooms (id, name, name_ar, err_code)')
          .eq('id', initialProjectId)
          .eq('status', 'active')
          .single()
        
        if (error || !projectData) return
        
        setSelectedState(projectData.state || '')
        setSelectedRoomId(projectData.emergency_room_id || '')
        setProjectId(projectData.id)
      } catch (e) {
        console.error('Failed to load initial project', e)
      }
    })()
  }, [open, initialProjectId])

  // When state changes, load ERR rooms in that state with active projects
  useEffect(() => {
    if (!selectedState) { 
      if (!isRestoringRef.current) {
        setRooms([]); 
        setSelectedRoomId(''); 
        setProjects([]); 
        setProjectId('')
      }
      return 
    }
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('emergency_room_id, emergency_rooms (id, name, name_ar, err_code)')
        .eq('status', 'active')
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
      if (!isRestoringRef.current) {
        setSelectedRoomId('')
        setProjects([])
        setProjectId('')
      }
    })()
  }, [selectedState])

  // When room changes, load its active projects
  useEffect(() => {
    if (!selectedRoomId) { 
      if (!isRestoringRef.current) {
        setProjects([]); 
        setProjectId('')
      }
      return 
    }
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('id, project_name, submitted_at, locality, planned_activities, expenses')
        .eq('status', 'active')
        .eq('emergency_room_id', selectedRoomId)
        .order('submitted_at', { ascending: false })
      setProjects(((data as any[]) || []).map((p:any)=> {
        // Extract category from first planned activity
        let category = ''
        try {
          const plannedArr = Array.isArray(p.planned_activities)
            ? p.planned_activities
            : (typeof p.planned_activities === 'string' ? JSON.parse(p.planned_activities || '[]') : [])
          if (Array.isArray(plannedArr) && plannedArr.length > 0 && plannedArr[0]?.category) {
            category = plannedArr[0].category
          }
        } catch {}
        
        // Calculate total from planned_activities (for ERR App submissions)
        let fromPlanned = 0
        try {
          const plannedArr = Array.isArray(p.planned_activities)
            ? p.planned_activities
            : (typeof p.planned_activities === 'string' ? JSON.parse(p.planned_activities || '[]') : [])
          fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
            const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
            return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
          }, 0)
        } catch {}
        
        // Calculate total from expenses (for mutual_aid_portal submissions)
        let fromExpenses = 0
        try {
          const expensesArr = Array.isArray(p.expenses)
            ? p.expenses
            : (typeof p.expenses === 'string' ? JSON.parse(p.expenses || '[]') : [])
          fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => {
            return s + (Number(ex.total_cost) || 0)
          }, 0)
        } catch {}
        
        // Use expenses total if it exists (mutual_aid_portal), otherwise use planned_activities total (ERR App)
        const total = fromExpenses > 0 ? fromExpenses : fromPlanned
        
        const locality = p.locality || ''
        const totalFormatted = total > 0 ? ` (${total.toLocaleString()})` : ''
        const label = category 
          ? `${locality} - ${category}${totalFormatted}` 
          : (locality ? `${locality}${totalFormatted}` : (p.project_name || p.id))
        return { id: p.id, label }
      }))
    })()
  }, [selectedRoomId])

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
      // Calculate total from planned_activities (for ERR App submissions)
      const plannedArr = Array.isArray((data as any)?.planned_activities)
        ? (data as any).planned_activities
        : (typeof (data as any)?.planned_activities === 'string' ? JSON.parse((data as any)?.planned_activities || '[]') : [])
      const fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
        const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
        return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
      }, 0)

      // Calculate total from expenses (for mutual_aid_portal submissions)
      const expensesArr = Array.isArray((data as any)?.expenses)
        ? (data as any).expenses
        : (typeof (data as any)?.expenses === 'string' ? JSON.parse((data as any)?.expenses || '[]') : [])
      const fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => {
        return s + (Number(ex.total_cost) || 0)
      }, 0)

      // Use expenses total if it exists (mutual_aid_portal), otherwise use planned_activities total (ERR App)
      const grantSum = fromExpenses > 0 ? fromExpenses : fromPlanned
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
      // Get signed URL for file viewing
      const { data: signedUrl } = await supabase.storage.from('images').createSignedUrl(key, 3600)
      if (signedUrl?.signedUrl) {
        setFileUrl(signedUrl.signedUrl)
      }

      const parseRes = await fetch('/api/f4/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, file_key_temp: key }) })
      const text = await parseRes.text()
      let parseJson: any
      try { parseJson = JSON.parse(text) } catch { throw new Error(`Parse failed: ${parseRes.status} ${parseRes.statusText} — ${text.slice(0, 200)}`) }
      if (!parseRes.ok) throw new Error(parseJson.error || 'Parse failed')
      setSummaryDraft({ ...(parseJson.summaryDraft || {}), report_date: reportDate || (parseJson.summaryDraft?.report_date || '') })
      setRawOcr(parseJson.summaryDraft?.raw_ocr || '')
      setAiOutput(parseJson.aiOutput || null)
      setExpensesDraft((parseJson.expensesDraft || []).map((ex: any) => ({
        ...ex,
        // Ensure both SDG and USD amounts are preserved
        expense_amount_sdg: ex.expense_amount_sdg ?? null,
        expense_amount: ex.expense_amount ?? null,
        // default payment method so it persists even if user doesn't touch the select
        payment_method: ex.payment_method || 'Bank Transfer'
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
    if (isRestoring || isRestoringRef.current) {
      console.warn('Cannot save while restoring state')
      return
    }
    if (!projectId || !summaryDraft) {
      console.warn('Missing required fields:', { projectId, hasSummaryDraft: !!summaryDraft })
      return
    }
    setIsLoading(true)
    try {
      const totalExpensesSDG = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0)
      const totalExpensesUSD = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)
      const totalGrantUSD = projectMeta?.total_grant_from_project ?? 0
      const remainderUSD = totalGrantUSD - totalExpensesUSD
      
      const summaryToSave = {
        ...summaryDraft,
        total_grant: totalGrantUSD,
        total_expenses: totalExpensesUSD,
        total_expenses_sdg: totalExpensesSDG,
        remainder: remainderUSD
      }
      const res = await fetch('/api/f4/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, summary: summaryToSave, expenses: expensesDraft, file_key_temp: tempKey }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      try { window.localStorage.removeItem('err_minimized_modal') } catch {}
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
    setSelectedState('')
    setSelectedRoomId('')
    setSummaryDraft(null)
    setExpensesDraft([])
    setStep('select')
        setTempKey('')
        setFileUrl('')
        setRawOcr('')
        setAiOutput(null)
    setFxRate(null)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { 
      onOpenChange(v); 
      if (!v) {
        if (isMinimizingRef.current) {
          isMinimizingRef.current = false
        } else {
          try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}
          // Reset all form fields on explicit close
          setStep('select')
          setProjectId('')
          setFile(null)
          setReportDate('')
          setSelectedState('')
          setSelectedRoomId('')
          setSummaryDraft(null)
          setExpensesDraft([])
          setTempKey('')
          setFileUrl('')
          setRawOcr('')
          setAiOutput(null)
        }
      }
    }}>
      <DialogContent 
        className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto select-text"
        onInteractOutside={(e:any)=>{ 
          e.preventDefault(); 
          try { 
            const snapshot = JSON.stringify({ type: 'f4', step, summaryDraft, expensesDraft, projectId, reportDate, selectedState, selectedRoomId, tempKey, fileUrl })
            window.localStorage.setItem('err_minimized_modal','f4'); 
            window.localStorage.setItem('err_minimized_payload', snapshot);
            window.dispatchEvent(new CustomEvent('err_minimized_modal_change', { detail: 'f4' } as any)) 
          } catch {} 
          isMinimizingRef.current = true
          onOpenChange(false) 
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('f4.modal.title')}</DialogTitle>
        </DialogHeader>
        {step === 'select' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t('f4.modal.state')}</Label>
                <Select value={selectedState} onValueChange={(v)=>{ setSelectedState(v); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f4.modal.state_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f4.modal.err')}</Label>
                <Select value={selectedRoomId} onValueChange={(v)=>{ setSelectedRoomId(v); }} disabled={!selectedState}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f4.modal.err_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f4.modal.project')}</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!selectedRoomId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f4.modal.project_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('f4.modal.report_date')}</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('f4.modal.summary_file')}</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="text-xs text-muted-foreground">{t('f4.modal.choose_file_hint')}</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f4.modal.cancel')}</Button>
              <Button onClick={handleUploadAndParse} disabled={!projectId || !file || isLoading}>{isLoading ? 'Processing…' : t('f4.modal.process')}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 select-text">
            {/* Form Content */}
            <div className="space-y-6">
            {/* Summary Header */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('f4.preview.labels.err_room')}</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{projectMeta?.roomLabel || '-'}</div>
                </div>
                <div>
                  <Label>{t('f4.preview.labels.report_date')}</Label>
                  <Input type="date" value={summaryDraft?.report_date ?? reportDate} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>{t('f4.preview.labels.project_activities')}</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{projectMeta?.project_objectives || '-'}</div>
              </div>
              <div>
                <Label>{t('f4.preview.labels.beneficiaries')}</Label>
                <Input value={summaryDraft?.beneficiaries ?? projectMeta?.beneficiaries ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), beneficiaries: e.target.value }))} />
              </div>
              {/* FX Rate (moved here) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('f4.preview.labels.fx_rate')}</Label>
                  <Input type="number" value={fxRate ?? ''} onChange={(e)=>{
                    const v = parseFloat(e.target.value)
                    setFxRate(isNaN(v) ? null : v)
                    // When exchange rate is set, calculate USD from SDG for all expenses
                    if (!isNaN(v) && v > 0) {
                      setExpensesDraft(prev => prev.map((ex:any)=>{
                        const sdg = ex.expense_amount_sdg
                        if (typeof sdg === 'number' && sdg > 0) {
                          return {
                            ...ex,
                            expense_amount: +(sdg / v).toFixed(2)
                          }
                        }
                        return ex
                      }))
                    }
                  }} placeholder={t('f4.preview.labels.fx_placeholder') as string} />
                </div>
              </div>
            </div>

            {/* Expenses (move above Financials) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('f4.preview.expenses.title')}</Label>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setExpensesDraft(prev => ([...prev, {
                    expense_activity: '',
                    expense_description: '',
                    expense_amount_sdg: null,
                    expense_amount: null,
                    payment_date: '',
                    payment_method: 'Bank Transfer',
                    receipt_no: '',
                    seller: '',
                    is_draft: true
                  }]))}
                >{t('f4.preview.expenses.add')}</Button>
              </div>
              <div className="border rounded overflow-hidden select-text">
                {expensesDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('f4.preview.expenses.empty')}</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[14%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.activity')}</TableHead>
                        <TableHead className="w-[20%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.description')}</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (SDG)</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (USD)</TableHead>
                        <TableHead className="w-[12%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.payment_date')}</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.method')}</TableHead>
                        <TableHead className="w-[10%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.receipt_no')}</TableHead>
                        <TableHead className="w-[14%] py-1 px-2 text-xs">{t('f4.preview.expenses.cols.seller')}</TableHead>
                        <TableHead className="w-[8%] py-1 px-2 text-xs text-right">{t('f4.preview.expenses.cols.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expensesDraft.map((ex, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder={t('f4.preview.expenses.cols.activity') as string} value={ex.expense_activity || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_activity: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder={t('f4.preview.expenses.cols.description') as string} value={ex.expense_description || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_description: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Input className="h-8" type="number" placeholder="SDG" value={ex.expense_amount_sdg ?? ''} onChange={(e)=>{
                              const enteredValue = parseFloat(e.target.value) || 0
                              const arr = [...expensesDraft]
                              arr[idx] = {
                                ...arr[idx],
                                expense_amount_sdg: enteredValue || null,
                                // Auto-calculate USD if exchange rate is set
                                expense_amount: (fxRate && fxRate > 0 && enteredValue > 0) ? +(enteredValue / fxRate).toFixed(2) : arr[idx].expense_amount
                              }
                              setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Input className="h-8" type="number" placeholder="USD" value={ex.expense_amount ?? ''} onChange={(e)=>{
                              const enteredValue = parseFloat(e.target.value) || 0
                              const arr = [...expensesDraft]
                              arr[idx] = {
                                ...arr[idx],
                                expense_amount: enteredValue || null,
                                // Auto-calculate SDG if exchange rate is set
                                expense_amount_sdg: (fxRate && fxRate > 0 && enteredValue > 0) ? +(enteredValue * fxRate).toFixed(2) : arr[idx].expense_amount_sdg
                              }
                              setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" type="date" placeholder={t('f4.preview.expenses.cols.payment_date') as string} value={ex.payment_date || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_date: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Select value={ex.payment_method || 'Bank Transfer'} onValueChange={(v)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_method: v}; setExpensesDraft(arr)
                            }}>
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder={t('f4.preview.expenses.cols.method') as string} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                <SelectItem value="Cash">Cash</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder={t('f4.preview.expenses.cols.receipt_no') as string} value={ex.receipt_no || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], receipt_no: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <Input className="h-8" placeholder={t('f4.preview.expenses.cols.seller') as string} value={ex.seller || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], seller: e.target.value}; setExpensesDraft(arr)
                            }} />
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const arr = [...expensesDraft]
                                arr.splice(idx, 1)
                                setExpensesDraft(arr)
                              }}
                            >{t('f4.preview.expenses.cols.delete')}</Button>
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
                <Label>{t('f4.preview.financials.total_grant')} (USD)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{(projectMeta?.total_grant_from_project ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_expenses')} (USD)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_expenses')} (SDG)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.remainder')} (USD)</Label>
                <Input type="number" value={(projectMeta?.total_grant_from_project || 0) - expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)} readOnly />
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_other_sources')}</Label>
                <Input type="number" value={summaryDraft?.total_other_sources ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), total_other_sources: parseFloat(e.target.value)||0 }))} />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.excess_expenses')}</Label>
                <Input value={summaryDraft?.excess_expenses ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), excess_expenses: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.surplus_use')}</Label>
                <Input value={summaryDraft?.surplus_use ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), surplus_use: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.lessons_learned')}</Label>
                <Input value={summaryDraft?.lessons ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>{t('f4.preview.financials.training_needs')}</Label>
                <Input value={summaryDraft?.training ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), training: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={()=>setStep('select')}>{t('f4.preview.buttons.back')}</Button>
              <Button onClick={handleSave} disabled={isLoading || isRestoring}>{isLoading ? t('f4.preview.buttons.saving') : t('f4.preview.buttons.save')}</Button>
            </div>
            </div>

            {/* View File - Collapsible Section */}
            <CollapsibleRow title={t('f4.preview.tabs.view_file')} defaultOpen={false}>
              <Card>
                <CardHeader>
                  <CardTitle>Uploaded File</CardTitle>
                </CardHeader>
                <CardContent>
                  {fileUrl ? (
                    <div className="w-full h-[600px] border rounded">
                      {(file?.type === 'application/pdf' || /\.pdf$/i.test(String(tempKey || ''))) ? (
                        <iframe 
                          src={fileUrl} 
                          className="w-full h-full rounded"
                          title="F4 Report PDF"
                        />
                      ) : (
                        <img 
                          src={fileUrl} 
                          alt="F4 Report" 
                          className="w-full h-full object-contain rounded"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="w-full h-[600px] border rounded flex items-center justify-center text-muted-foreground">
                      No file preview available
                    </div>
                  )}
                </CardContent>
              </Card>
            </CollapsibleRow>

            {/* OCR Text - Collapsible Section */}
            <CollapsibleRow title="OCR Text" defaultOpen={false}>
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>AI Output (Parsed JSON)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/30 p-4 rounded font-mono text-sm whitespace-pre whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                      {aiOutput ? (
                        <pre>{JSON.stringify(aiOutput, null, 2)}</pre>
                      ) : (
                        'No AI output available'
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Full OCR Text</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/30 p-4 rounded font-mono text-sm whitespace-pre-wrap max-h-[400px] overflow-y-auto" dir="rtl">
                      {rawOcr || 'No OCR text available'}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CollapsibleRow>
          </div>
        )}
      </DialogContent>
    </Dialog>
    {minimized && (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded border bg-background shadow-lg">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-sm font-medium">{t('f4.modal.title')}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setMinimized(false); onOpenChange(true) }}>Restore</Button>
            <Button size="sm" variant="ghost" onClick={() => { setMinimized(false); try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; reset() }}>X</Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}


