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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Pencil, Flag } from 'lucide-react'

interface UploadF5ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

// Helper function to extract table data from raw OCR
const extractTables = (rawOcr: string) => {
  const activitiesTable: string[] = []
  const demographicsTable: string[] = []
  
  if (!rawOcr) return { activitiesTable, demographicsTable }
  
  const lines = rawOcr.split('\n')
  let inActivitiesSection = false
  let inDemographicsSection = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Detect activities table section
    if (line.includes('الأنشطة المنفذة') || line.includes('إسم النشاط')) {
      inActivitiesSection = true
      inDemographicsSection = false
      activitiesTable.push(line)
      continue
    }
    
    // Detect demographics table section
    if (line.includes('الحصر الإضافي للمستفيدين') || (line.includes('ذكور') && line.includes('إناث'))) {
      inDemographicsSection = true
      inActivitiesSection = false
      demographicsTable.push(line)
      continue
    }
    
    // Stop activities section when we hit demographics or narrative
    if (inActivitiesSection && (line.includes('الحصر الإضافي') || line.includes('التأثيرات'))) {
      inActivitiesSection = false
    }
    
    // Stop demographics section when we hit narrative
    if (inDemographicsSection && (line.includes('التأثيرات') || line.includes('أروي'))) {
      inDemographicsSection = false
    }
    
    // Add lines to appropriate table
    if (inActivitiesSection && line.length > 0) {
      activitiesTable.push(line)
    } else if (inDemographicsSection && line.length > 0) {
      demographicsTable.push(line)
    }
  }
  
  return { activitiesTable, demographicsTable }
}

export default function UploadF5Modal({ open, onOpenChange, onSaved }: UploadF5ModalProps) {
  const { t } = useTranslation(['f4f5'])
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
  const [fileUrl, setFileUrl] = useState<string>('')
  const [rawOcr, setRawOcr] = useState<string>('')
  const [activeTab, setActiveTab] = useState('form')
  const [adjustOpen, setAdjustOpen] = useState<{ row: number; key: string } | null>(null)
  const [adjustTempValue, setAdjustTempValue] = useState<number | ''>('')
  const [adjustTempNote, setAdjustTempNote] = useState<string>('')
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustDialogTitle, setAdjustDialogTitle] = useState<string>('')
  const [minimized, setMinimized] = useState(false)
  const isMinimizingRef = useRef(false)
  const isRestoringRef = useRef(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const keyToOriginal = (row: any, key: string): number => {
    switch (key) {
      case 'individuals': return Number(row.individual_count || 0)
      case 'households': return Number(row.household_count || 0)
      case 'male': return Number(row.male_count || 0)
      case 'female': return Number(row.female_count || 0)
      case 'under18_male': return Number(row.under18_male || 0)
      case 'under18_female': return Number(row.under18_female || 0)
      default: return 0
    }
  }

  const keyAdjustedValue = (row: any, key: string): number | undefined => {
    const obj = row?.adjusted_counts || {}
    const entry = obj ? obj[key] : undefined
    if (entry == null) return undefined
    // support both plain number and object shape { v, note }
    const raw = typeof entry === 'object' && entry !== null && 'v' in entry ? (entry as any).v : entry
    const n = Number(raw)
    return isNaN(n) ? undefined : n
  }

  const keyAdjustedNote = (row: any, key: string): string | undefined => {
    const obj = row?.adjusted_counts || {}
    const entry = obj ? obj[key] : undefined
    if (entry && typeof entry === 'object' && 'note' in entry) {
      return (entry as any).note || undefined
    }
    return undefined
  }

  const keyEffective = (row: any, key: string): number => {
    const adj = keyAdjustedValue(row, key)
    return adj != null ? Number(adj) : keyToOriginal(row, key)
  }

  const deltaInfo = (row: any, key: string): string => {
    const adj = keyAdjustedValue(row, key)
    if (adj == null) return ''
    const orig = keyToOriginal(row, key)
    const noteForKey = keyAdjustedNote(row, key)
    const note = noteForKey ? `\nNote: ${noteForKey}` : ''
    return `${orig} → ${adj}${note}`
  }

  const openAdjustFor = (rowIdx: number, key: string) => {
    const row = reachDraft[rowIdx]
    const current = keyAdjustedValue(row, key)
    setAdjustTempValue(current == null ? '' : Number(current))
    setAdjustTempNote(keyAdjustedNote(row, key) || '')
    setAdjustOpen({ row: rowIdx, key })
    const titleMap: Record<string, string> = {
      individuals: 'Adjusted individuals',
      households: 'Adjusted households',
      male: 'Adjusted male',
      female: 'Adjusted female',
      under18_male: 'Adjusted male \u003c 18',
      under18_female: 'Adjusted female \u003c 18'
    }
    setAdjustDialogTitle(titleMap[key] || 'Adjustment')
    setAdjustDialogOpen(true)
  }

  const saveAdjust = () => {
    if (!adjustOpen) return
    const { row, key } = adjustOpen
    const arr = [...reachDraft]
    const r = { ...(arr[row] || {}) }
    const counts = { ...(r.adjusted_counts || {}) } as any
    if (adjustTempValue === '' || adjustTempValue == null) {
      delete counts[key]
    } else {
      counts[key] = adjustTempNote ? { v: Number(adjustTempValue), note: adjustTempNote } : { v: Number(adjustTempValue) }
    }
    r.adjusted_counts = counts
    arr[row] = r
    setReachDraft(arr)
    setAdjustOpen(null)
    setAdjustDialogOpen(false)
  }

  const resetAdjust = () => {
    if (!adjustOpen) return
    const { row, key } = adjustOpen
    const arr = [...reachDraft]
    const r = { ...(arr[row] || {}) }
    const counts = { ...(r.adjusted_counts || {}) }
    delete counts[key]
    r.adjusted_counts = counts
    arr[row] = r
    setReachDraft(arr)
    setAdjustTempValue('')
    setAdjustOpen(null)
    setAdjustDialogOpen(false)
  }

  useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data } = await supabase
        .from('err_projects')
        .select('state')
        .eq('status', 'active')
      const uniq = Array.from(new Set(((data as any[]) || []).map((r:any)=>r.state).filter(Boolean))) as string[]
      setStates(uniq)
    })()
  }, [open])

  // Try restore from snapshot when opening
  useEffect(() => {
    if (!open) return
    // If opening fresh (not via restore flags), proactively clear any stale snapshot and reset state
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
        setReachDraft([])
        setTempKey('')
        setFileUrl('')
        setRawOcr('')
        setActiveTab('form')
        return
      }
    } catch {}
    try {
      const raw = window.localStorage.getItem('err_minimized_payload')
      const type = window.localStorage.getItem('err_minimized_modal')
      if (raw && type === 'f5') {
        const p = JSON.parse(raw)
        if (p?.type === 'f5') {
          isRestoringRef.current = true
          setIsRestoring(true)
          if (p.step) setStep(p.step)
          if (p.summaryDraft) setSummaryDraft(p.summaryDraft)
          if (Array.isArray(p.reachDraft)) setReachDraft(p.reachDraft)
          if (p.reportDate) setReportDate(p.reportDate)
          if (p.selectedState) setSelectedState(p.selectedState)
          if (p.selectedRoomId) setSelectedRoomId(p.selectedRoomId)
          if (p.projectId) setProjectId(p.projectId)
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
          if (p.activeTab) setActiveTab(p.activeTab)
          // Clear snapshot after restoring and reset restore flag after state updates
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
        .select('id, project_name, submitted_at')
        .eq('status', 'active')
        .eq('emergency_room_id', selectedRoomId)
        .order('submitted_at', { ascending: false })
      setProjects(((data as any[]) || []).map((p:any)=> ({ id: p.id, label: p.project_name || p.id })))
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
      setRawOcr(parseJson.summaryDraft?.raw_ocr || '')
      
      // Get signed URL for file viewing
      const { data: signedUrl } = await supabase.storage.from('images').createSignedUrl(key, 3600)
      if (signedUrl?.signedUrl) {
        setFileUrl(signedUrl.signedUrl)
      }
      
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
      const summaryToSave = { ...summaryDraft }
      const res = await fetch('/api/f5/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, summary: summaryToSave, reach: reachDraft, file_key_temp: tempKey }) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      try { window.localStorage.removeItem('err_minimized_modal') } catch {}
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
    setSelectedState('')
    setSelectedRoomId('')
    setSummaryDraft(null)
    setReachDraft([])
    setStep('select')
    setTempKey('')
    setFileUrl('')
    setRawOcr('')
    setActiveTab('form')
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => { 
      onOpenChange(v); 
      if (!v) {
        if (isMinimizingRef.current) {
          // Close caused by minimize path, keep snapshot/minimized bar
          isMinimizingRef.current = false
        } else {
          // Explicit close (X or cancel) -> clear minimized state and snapshot
          try { 
            window.localStorage.removeItem('err_minimized_modal'); 
            window.localStorage.removeItem('err_minimized_payload'); 
            window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) 
          } catch {}
          // Also reset local modal state to pre-processing defaults - reset all form fields
          setStep('select')
          setProjectId('')
          setFile(null)
          setReportDate('')
          setSelectedState('')
          setSelectedRoomId('')
          setSummaryDraft(null)
          setReachDraft([])
          setTempKey('')
          setFileUrl('')
          setRawOcr('')
          setActiveTab('form')
        }
      }
    }}>
      <DialogContent 
        className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto select-text"
        onInteractOutside={(e:any)=>{ 
          // If the adjustment dialog is open, don't minimize; keep parent modal active
          if (adjustDialogOpen) { e.preventDefault(); return }
          e.preventDefault(); 
          try {
            const snapshot = JSON.stringify({ type: 'f5', step, summaryDraft, reachDraft, reportDate, selectedState, selectedRoomId, projectId, tempKey, fileUrl, activeTab })
            window.localStorage.setItem('err_minimized_modal','f5')
            window.localStorage.setItem('err_minimized_payload', snapshot)
            window.dispatchEvent(new CustomEvent('err_minimized_modal_change', { detail: 'f5' } as any))
          } catch {}
          isMinimizingRef.current = true
          onOpenChange(false) 
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('f5.modal.title')}</DialogTitle>
        </DialogHeader>
        {step === 'select' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{t('f5.modal.state')}</Label>
                <Select value={selectedState} onValueChange={(v)=>{ setSelectedState(v); }}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f5.modal.state_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f5.modal.err')}</Label>
                <Select value={selectedRoomId} onValueChange={(v)=>{ setSelectedRoomId(v); }} disabled={!selectedState}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f5.modal.err_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {rooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('f5.modal.project')}</Label>
                <Select value={projectId} onValueChange={setProjectId} disabled={!selectedRoomId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('f5.modal.project_placeholder') as string} /></SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('f5.modal.report_date')}</Label>
              <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('f5.modal.report_file')}</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <div className="text-xs text-muted-foreground">{t('f5.modal.choose_file_hint')}</div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('f5.modal.cancel')}</Button>
              <Button onClick={handleUploadAndParse} disabled={!projectId || !file || isLoading}>{isLoading ? 'Processing…' : t('f5.modal.process')}</Button>
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="form">{t('f5.preview.tabs.edit_form')}</TabsTrigger>
              <TabsTrigger value="file">{t('f5.preview.tabs.view_file')}</TabsTrigger>
              <TabsTrigger value="tables">{t('f5.preview.tabs.tables')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="form" className="space-y-6 select-text mt-6">
            {/* Summary */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('f5.preview.summary.report_date')}</Label>
                  <Input type="date" value={summaryDraft?.report_date ?? reportDate} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('f5.preview.summary.reporting_person')}</Label>
                  <Input value={summaryDraft?.reporting_person ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), reporting_person: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{t('f5.preview.summary.positive_changes')}</Label>
                  <Input value={summaryDraft?.positive_changes ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), positive_changes: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('f5.preview.summary.negative_results')}</Label>
                  <Input value={summaryDraft?.negative_results ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), negative_results: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('f5.preview.summary.unexpected_results')}</Label>
                  <Input value={summaryDraft?.unexpected_results ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), unexpected_results: e.target.value }))} />
                </div>
                <div>
                  <Label>{t('f5.preview.summary.lessons_learned')}</Label>
                  <Input value={summaryDraft?.lessons_learned ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons_learned: e.target.value }))} />
                </div>
                <div className="md:col-span-2">
                  <Label>{t('f5.preview.summary.suggestions')}</Label>
                  <Input value={summaryDraft?.suggestions ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), suggestions: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Activities Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('f5.preview.activities.title')}</Label>
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
                >{t('f5.preview.activities.add')}</Button>
              </div>
              <div className="border rounded overflow-hidden select-text">
                {reachDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('f5.preview.activities.empty')}</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.activity_name')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.activity_goal')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.location')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.start')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.end')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.beneficiaries_individuals')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.activities.cols.beneficiaries_families')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs text-right">{t('f5.preview.activities.cols.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reachDraft.map((row, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2"><Input className="h-8" placeholder={t('f5.preview.activities.cols.activity_name') as string} value={row.activity_name || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_name: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" placeholder={t('f5.preview.activities.cols.activity_goal') as string} value={row.activity_goal || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], activity_goal: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" placeholder={t('f5.preview.activities.cols.location') as string} value={row.location || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], location: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="date" value={row.start_date || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], start_date: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="date" value={row.end_date || ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], end_date: e.target.value}; setReachDraft(arr) }} /></TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative flex items-center gap-2">
                              <Input className="h-8" type="number" value={row.individual_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], individual_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} />
                              {keyAdjustedValue(row, 'individuals') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row, 'individuals')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'individuals')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative flex items-center gap-2">
                              <Input className="h-8" type="number" value={row.household_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], household_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} />
                              {keyAdjustedValue(row, 'households') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row, 'households')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'households')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button variant="destructive" size="sm" onClick={()=>{ const arr=[...reachDraft]; arr.splice(idx,1); setReachDraft(arr) }}>{t('f5.preview.activities.cols.delete')}</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            {/* Demographics Breakdown Table */}
            <div>
              <Label>{t('f5.preview.demographics.title')}</Label>
              <div className="border rounded overflow-hidden select-text">
                {reachDraft.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">{t('f5.preview.demographics.empty')}</div>
                ) : (
                  <Table className="select-text">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.demographics.cols.activity')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.demographics.cols.male')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.demographics.cols.female')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.demographics.cols.male_u18')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.demographics.cols.female_u18')}</TableHead>
                        <TableHead className="py-1 px-2 text-xs">{t('f5.preview.demographics.cols.pwd')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reachDraft.map((row, idx) => (
                        <TableRow key={idx} className="text-sm">
                          <TableCell className="py-1 px-2">{row.activity_name || '-'}</TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative flex items-center gap-2">
                              <Input className="h-8" type="number" value={row.male_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], male_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} />
                              {keyAdjustedValue(row,'male') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'male')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'male')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative flex items-center gap-2">
                              <Input className="h-8" type="number" value={row.female_count ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], female_count: parseInt(e.target.value)||0}; setReachDraft(arr) }} />
                              {keyAdjustedValue(row,'female') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'female')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'female')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative flex items-center gap-2">
                              <Input className="h-8" type="number" value={row.under18_male ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_male: parseInt(e.target.value)||0}; setReachDraft(arr) }} />
                              {keyAdjustedValue(row,'under18_male') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'under18_male')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'under18_male')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2">
                            <div className="relative flex items-center gap-2">
                              <Input className="h-8" type="number" value={row.under18_female ?? ''} onChange={(e)=>{ const arr=[...reachDraft]; arr[idx]={...arr[idx], under18_female: parseInt(e.target.value)||0}; setReachDraft(arr) }} />
                              {keyAdjustedValue(row,'under18_female') != null && (
                                <span className="absolute right-10 top-1.5 z-10 cursor-help pointer-events-auto" title={deltaInfo(row,'under18_female')}>
                                  <Flag className="h-3.5 w-3.5 text-red-500" />
                                </span>
                              )}
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={()=>openAdjustFor(idx,'under18_female')}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              {/* adjustment handled via modal */}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 px-2"><Input className="h-8" type="number" value={summaryDraft?.demographics?.special_needs ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), demographics: { ...(s?.demographics||{}), special_needs: parseInt(e.target.value)||0 } }))} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={()=>setStep('select')}>{t('f5.preview.buttons.back')}</Button>
              <Button onClick={handleSave} disabled={isLoading || isRestoring}>{isLoading ? t('f5.preview.buttons.saving') : t('f5.preview.buttons.save')}</Button>
            </div>
            </TabsContent>
            
            <TabsContent value="file" className="mt-6">
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
                          title="F5 Report PDF"
                        />
                      ) : (
                        <img 
                          src={fileUrl} 
                          alt="F5 Report" 
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
            </TabsContent>
            
            <TabsContent value="tables" className="mt-6">
              <div className="space-y-6">
                {(() => {
                  const { activitiesTable, demographicsTable } = extractTables(rawOcr)
                  return (
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle>Activities Table (الأنشطة المنفذة)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-muted/30 p-4 rounded font-mono text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto" dir="rtl">
                            {activitiesTable.length > 0 ? activitiesTable.join('\n') : 'No activities table detected'}
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <CardTitle>Demographics Table (الحصر الإضافي للمستفيدين)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="bg-muted/30 p-4 rounded font-mono text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto" dir="rtl">
                            {demographicsTable.length > 0 ? demographicsTable.join('\n') : 'No demographics table detected'}
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
                    </>
                  )
                })()}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>

    {minimized && (
      <div className="fixed bottom-4 right-4 z-50 w-80 rounded border bg-background shadow-lg">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="text-sm font-medium">{t('f5.modal.title')}</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setMinimized(false); onOpenChange(true) }}>Restore</Button>
            <Button size="sm" variant="ghost" onClick={() => { 
              setMinimized(false); 
              try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; 
              reset() 
            }}>X</Button>
          </div>
        </div>
      </div>
    )}

    {/* Adjustment modal */}
    <Dialog open={adjustDialogOpen} onOpenChange={(v)=>{ setAdjustDialogOpen(v); if (!v) { setAdjustOpen(null) } }}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{adjustDialogTitle || 'Adjustment'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">New value</Label>
            <Input className="h-9" type="number" value={adjustTempValue} onChange={(e)=>setAdjustTempValue(e.target.value===''?'':parseInt(e.target.value)||0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note (optional)</Label>
            <Input className="h-9" value={adjustTempNote} onChange={(e)=>setAdjustTempNote(e.target.value)} />
          </div>
          {adjustOpen && (
            <div className="text-xs text-muted-foreground">
              Original: {keyToOriginal(reachDraft[adjustOpen.row], adjustOpen.key)}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={resetAdjust}>Reset</Button>
            <Button onClick={saveAdjust}>Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}


