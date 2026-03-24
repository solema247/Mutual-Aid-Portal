'use client'

import { useEffect, useState, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import UploadF4Modal from './components/UploadF4Modal'
import { useTranslation } from 'react-i18next'
import ViewF4Modal from './components/ViewF4Modal'
import UploadF5Modal from './components/UploadF5Modal'
import ViewF5Modal from './components/ViewF5Modal'
import { useSearchParams, useRouter } from 'next/navigation'

interface F4Row {
  id: number
  project_id: string | null
  err_id: string | null
  err_name?: string | null
  state?: string | null
  donor?: string | null
  report_date: string | null
  total_grant: number | null
  total_expenses: number | null
  remainder: number | null
  attachments_count: number
  updated_at: string
  review_status?: string | null
  review_comment?: string | null
  reviewed_at?: string | null
}

interface F5Row {
  id: string
  project_id: string | null
  err_name?: string | null
  state?: string | null
  donor?: string | null
  report_date: string | null
  activities_count: number
  updated_at: string
}

function F4F5ReportingPageContent() {
  const { t } = useTranslation(['f4f5'])
  const searchParams = useSearchParams()
  const router = useRouter()
  const { can } = useAllowedFunctions()
  const canViewPage = can('f4_f5_view_page')
  const canUploadF4 = can('f4_upload')
  const canUploadF5 = can('f5_upload')
  const canViewF4 = can('f4_view_report')
  const canViewF5 = can('f5_view_report')
  const canFetchBySerial = can('f4_fetch_by_serial')
  const canReviewF4 = can('f4_review')
  const [tab, setTab] = useState<'f4'|'f5'>('f4')
  const [rows, setRows] = useState<F4Row[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [fErr, setFErr] = useState('')
  const [fState, setFState] = useState('')
  const [fDonor, setFDonor] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [serialInput, setSerialInput] = useState('')
  const [bySerialLoading, setBySerialLoading] = useState(false)
  const [bySerialError, setBySerialError] = useState<string | null>(null)
  const [bySerialResult, setBySerialResult] = useState<{ serial: string; projects: any[] } | null>(null)
  const [rejectSummaryId, setRejectSummaryId] = useState<number | null>(null)
  const [rejectComment, setRejectComment] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [attachSummaryId, setAttachSummaryId] = useState<number | null>(null)
  const [attachType, setAttachType] = useState<'receipt' | 'proof_of_payment' | null>(null)
  const [attachSaving, setAttachSaving] = useState(false)

  // F5 state
  const [f5Rows, setF5Rows] = useState<F5Row[]>([])
  const [f5Loading, setF5Loading] = useState(false)
  const [f5Q, setF5Q] = useState('')
  const [f5Err, setF5Err] = useState('')
  const [f5State, setF5State] = useState('')
  const [f5Donor, setF5Donor] = useState('')
  const [uploadF5Open, setUploadF5Open] = useState(false)
  const [viewF5Id, setViewF5Id] = useState<string | null>(null)
  const [viewF5Open, setViewF5Open] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/f4/list')
      if (!res.ok) throw new Error('failed list')
      const data = await res.json()
      setRows(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadF5 = async () => {
    try {
      setF5Loading(true)
      const res = await fetch('/api/f5/list')
      if (!res.ok) throw new Error('failed f5 list')
      const data = await res.json()
      setF5Rows(data)
    } catch (e) {
      console.error(e)
    } finally {
      setF5Loading(false)
    }
  }

  const fetchBySerial = async () => {
    const serial = serialInput.trim()
    if (!serial) return
    setBySerialError(null)
    setBySerialResult(null)
    setBySerialLoading(true)
    try {
      const res = await fetch(`/api/f4/by-serial?serial=${encodeURIComponent(serial)}`)
      const data = await res.json()
      if (!res.ok) {
        setBySerialError(data?.error || t('f4.by_serial_error'))
        return
      }
      setBySerialResult({ serial: data.serial, projects: data.projects })
    } catch (e) {
      console.error(e)
      setBySerialError(t('f4.by_serial_error'))
    } finally {
      setBySerialLoading(false)
    }
  }

  const openPaymentConfirmation = async (filePath: string) => {
    try {
      const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(filePath)}`)
      if (!response.ok) return
      const { url } = await response.json()
      if (url) window.open(url, '_blank')
    } catch {
      // ignore
    }
  }

  const submitReview = async (summaryId: number, status: 'accepted' | 'rejected', comment?: string) => {
    setReviewSaving(true)
    try {
      const res = await fetch(`/api/f4/summary/${summaryId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment: comment || '' })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      setRejectSummaryId(null)
      setRejectComment('')
      load()
    } catch (e) {
      console.error(e)
    } finally {
      setReviewSaving(false)
    }
  }

  const submitAttachment = async (summaryId: number, fileType: 'receipt' | 'proof_of_payment', file: File) => {
    setAttachSaving(true)
    try {
      const form = new FormData()
      form.set('file', file)
      form.set('file_type', fileType)
      const res = await fetch(`/api/f4/summary/${summaryId}/attachment`, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      setAttachSummaryId(null)
      setAttachType(null)
      load()
    } catch (e) {
      console.error(e)
    } finally {
      setAttachSaving(false)
    }
  }

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, router])

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'f5') loadF5() }, [tab])

  // Handle restore from minimized across pages and when search params change
  useEffect(() => {
    const restore = searchParams.get('restore')
    const localRestore = (typeof window !== 'undefined') ? window.localStorage.getItem('err_restore') : null

    const target = restore || localRestore || null
    if (target === 'f4') {
      // Ensure F4 tab is active so modal component is mounted
      setTab('f4')
      setUploadOpen(true)
      if (restore) router.replace('/err-portal/f4-f5-reporting')
      try { window.localStorage.removeItem('err_restore') } catch {}
    } else if (target === 'f5') {
      // Ensure F5 tab is active so modal component is mounted
      setTab('f5')
      setUploadF5Open(true)
      if (restore) router.replace('/err-portal/f4-f5-reporting')
      try { window.localStorage.removeItem('err_restore') } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  if (!canViewPage) return null

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="f4">{t('tabs.f4')}</TabsTrigger>
          <TabsTrigger value="f5">{t('tabs.f5')}</TabsTrigger>
        </TabsList>

        <TabsContent value="f4" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{t('f4.title')}</div>
            {canUploadF4 && (
            <Button onClick={() => { try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.localStorage.removeItem('err_restore'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; setUploadOpen(true) }}>{t('f4.upload')}</Button>
            )}
          </div>

          {canFetchBySerial && (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                  <Label className="text-xs font-medium text-muted-foreground">{t('f4.serial_lookup')}</Label>
                  <Input
                    className="h-9"
                    placeholder={t('f4.serial_placeholder') as string}
                    value={serialInput}
                    onChange={(e) => setSerialInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchBySerial()}
                  />
                </div>
                <Button onClick={fetchBySerial} disabled={bySerialLoading || !serialInput.trim()}>
                  {bySerialLoading ? t('f4.by_serial_loading') : t('f4.fetch')}
                </Button>
              </CardContent>
            </Card>
          )}

          {bySerialError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
              {bySerialError}
            </div>
          )}

          {bySerialResult && bySerialResult.projects.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="font-medium">Serial: {bySerialResult.serial}</div>
                {bySerialResult.projects.map((proj: any) => (
                  <div key={proj.project_id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span><strong>{t('f4.by_serial_f1_serial')}:</strong> {proj.f1_serial ?? proj.grant_serial_id ?? '-'}</span>
                      <span><strong>ERR:</strong> {proj.err_name ?? proj.err_id ?? '-'}</span>
                      <span><strong>State:</strong> {proj.state ?? '-'}</span>
                      <span><strong>Donor:</strong> {proj.donor ?? '-'}</span>
                    </div>
                    {proj.mou_id && (
                      <div className="flex flex-wrap gap-4 text-sm">
                        <span><strong>{t('f4.by_serial_mou')}:</strong>{' '}
                          <a href={`/err-portal/f3-mous?mou=${proj.mou_id}`} className="text-primary underline">{proj.mou_code || proj.mou_id}</a>
                        </span>
                        {proj.payment_confirmation && (
                          <>
                            {proj.payment_confirmation.exchange_rate != null && (
                              <span><strong>{t('f4.by_serial_exchange_rate')}:</strong> {Number(proj.payment_confirmation.exchange_rate).toLocaleString()}</span>
                            )}
                            {proj.payment_confirmation.transfer_date && (
                              <span><strong>{t('f4.by_serial_transfer_date')}:</strong> {new Date(proj.payment_confirmation.transfer_date).toLocaleDateString()}</span>
                            )}
                            {proj.payment_confirmation.file_path && (
                              <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => openPaymentConfirmation(proj.payment_confirmation.file_path)}>
                                {t('f4.by_serial_download_payment')}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {proj.summaries?.length > 0 && (
                      <div className="pt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-1">F4 reports</div>
                        <div className="flex flex-wrap gap-2">
                          {proj.summaries.map((s: any) => (
                            <div key={s.id} className="flex items-center gap-2 text-sm">
                              <span>{s.report_date ? new Date(s.report_date).toLocaleDateString() : s.id}</span>
                              {canViewF4 && (
                                <Button variant="outline" size="sm" onClick={() => { setViewId(s.id); setViewOpen(true) }}>
                                  {t('f4.view')}
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap md:flex-nowrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 flex-1 md:flex-none md:w-64 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f4.search')}</Label>
              <Input className="h-9" placeholder={t('f4.search') as string} value={q} onChange={(e)=>setQ(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-48 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f4.filters.err')}</Label>
              <Select value={fErr || '__ALL__'} onValueChange={(v)=>setFErr(v==='__ALL__'?'':v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={t('f4.filters.err') as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                  {[...new Set(rows.map(r=>r.err_name).filter(Boolean))].map((v)=> (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-48 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f4.filters.state')}</Label>
              <Select value={fState || '__ALL__'} onValueChange={(v)=>setFState(v==='__ALL__'?'':v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={t('f4.filters.state') as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                  {[...new Set(rows.map(r=>r.state).filter(Boolean))].map((v)=> (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-48 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f4.filters.donor')}</Label>
              <Select value={fDonor || '__ALL__'} onValueChange={(v)=>setFDonor(v==='__ALL__'?'':v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={t('f4.filters.donor') as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                  {[...new Set(rows.map(r=>r.donor).filter(Boolean))].map((v)=> (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-24 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground opacity-0 select-none" aria-hidden>Reset</Label>
              <Button
                variant="outline"
                className="h-9 w-full md:ml-auto"
                onClick={() => { setQ(''); setFErr(''); setFState(''); setFDonor(''); }}
              >{t('f4.filters.reset')}</Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('f4.headers.err')}</TableHead>
                    <TableHead>{t('f4.headers.state')}</TableHead>
                    <TableHead>{t('f4.headers.donor')}</TableHead>
                    <TableHead>{t('f4.headers.report_date')}</TableHead>
                    <TableHead className="text-right">{t('f4.headers.total_grant')}</TableHead>
                    <TableHead className="text-right">{t('f4.headers.total_expenses')}</TableHead>
                    <TableHead className="text-right">{t('f4.headers.remainder')}</TableHead>
                    <TableHead>{t('f4.headers.files')}</TableHead>
                    <TableHead>{t('f4.headers.updated')}</TableHead>
                    <TableHead>{t('f4.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-6">{t('f4.loading')}</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">{t('f4.empty')}</TableCell></TableRow>
                  ) : rows
                    .filter(r => !q || [r.err_name, r.state, r.donor].some(v => (v||'').toLowerCase().includes(q.toLowerCase())))
                    .filter(r => !fErr || r.err_name === fErr)
                    .filter(r => !fState || r.state === fState)
                    .filter(r => !fDonor || r.donor === fDonor)
                    .map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.err_name || r.err_id || '-'}</TableCell>
                      <TableCell>{r.state || '-'}</TableCell>
                      <TableCell>{r.donor || '-'}</TableCell>
                      <TableCell>{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-right">{Number(r.total_grant || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(r.total_expenses || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(r.remainder || 0).toLocaleString()}</TableCell>
                      <TableCell>{r.attachments_count}</TableCell>
                      <TableCell>{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(r.review_status === 'accepted' || r.review_status === 'rejected') && (
                            <span className="text-xs text-muted-foreground capitalize">{r.review_status}</span>
                          )}
                          {canViewF4 && (
                            <Button variant="outline" size="sm" onClick={()=>{ setViewId(r.id); setViewOpen(true) }}>{t('f4.view')}</Button>
                          )}
                          {canReviewF4 && (
                            <>
                              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setAttachSummaryId(r.id); setAttachType('receipt') }}>{t('f4.row.receipt')}</Button>
                              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setAttachSummaryId(r.id); setAttachType('proof_of_payment') }}>{t('f4.row.proof_of_payment')}</Button>
                              {r.review_status !== 'accepted' && (
                                <Button variant="outline" size="sm" className="h-8 text-xs text-green-700" onClick={() => submitReview(r.id, 'accepted')} disabled={reviewSaving}>Accept</Button>
                              )}
                              {r.review_status !== 'rejected' && (
                                <Button variant="outline" size="sm" className="h-8 text-xs text-destructive" onClick={() => setRejectSummaryId(r.id)} disabled={reviewSaving}>Reject</Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <UploadF4Modal open={uploadOpen} onOpenChange={setUploadOpen} onSaved={load} />
          <ViewF4Modal summaryId={viewId} open={viewOpen} onOpenChange={(v)=>{ setViewOpen(v); if (!v) setViewId(null) }} onSaved={load} />

          <Dialog open={rejectSummaryId != null} onOpenChange={(open) => { if (!open) { setRejectSummaryId(null); setRejectComment('') } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Reject F4 report</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Add a comment (optional). The report will be returned to ERR/LoHub for correction.</p>
              <Input placeholder="Comment…" value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} className="mt-2" />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setRejectSummaryId(null); setRejectComment('') }}>Cancel</Button>
                <Button variant="destructive" disabled={reviewSaving} onClick={() => rejectSummaryId != null && submitReview(rejectSummaryId, 'rejected', rejectComment)}>
                  {reviewSaving ? 'Saving…' : 'Reject'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={attachSummaryId != null && attachType != null} onOpenChange={(open) => { if (!open) { setAttachSummaryId(null); setAttachType(null) } }}>
            <DialogContent>
              <DialogHeader><DialogTitle>{attachType === 'receipt' ? t('f4.row.receipt') : t('f4.row.proof_of_payment')}</DialogTitle></DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]'); if (input?.files?.[0] && attachSummaryId && attachType) submitAttachment(attachSummaryId, attachType, input.files[0]) }}>
                <Label className="text-sm">Select file</Label>
                <Input type="file" accept=".pdf,image/*" className="mt-2" required />
                <DialogFooter className="mt-4">
                  <Button type="button" variant="outline" onClick={() => { setAttachSummaryId(null); setAttachType(null) }}>Cancel</Button>
                  <Button type="submit" disabled={attachSaving}>{attachSaving ? 'Uploading…' : 'Upload'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="f5" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{t('f5.title')}</div>
            {canUploadF5 && (
            <Button onClick={() => { try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.localStorage.removeItem('err_restore'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; setUploadF5Open(true) }}>{t('f5.upload')}</Button>
            )}
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-4 items-end">
            <div className="flex flex-col gap-1.5 flex-1 md:flex-none md:w-64 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f5.search')}</Label>
              <Input className="h-9" placeholder={t('f5.search') as string} value={f5Q} onChange={(e)=>setF5Q(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-48 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f5.filters.err')}</Label>
              <Select value={f5Err || '__ALL__'} onValueChange={(v)=>setF5Err(v==='__ALL__'?'':v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={t('f5.filters.err') as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                  {[...new Set(f5Rows.map(r=>r.err_name).filter(Boolean))].map((v)=> (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-48 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f5.filters.state')}</Label>
              <Select value={f5State || '__ALL__'} onValueChange={(v)=>setF5State(v==='__ALL__'?'':v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={t('f5.filters.state') as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                  {[...new Set(f5Rows.map(r=>r.state).filter(Boolean))].map((v)=> (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-48 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground">{t('f5.filters.donor')}</Label>
              <Select value={f5Donor || '__ALL__'} onValueChange={(v)=>setF5Donor(v==='__ALL__'?'':v)}>
                <SelectTrigger className="h-9 w-full"><SelectValue placeholder={t('f5.filters.donor') as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                  {[...new Set(f5Rows.map(r=>r.donor).filter(Boolean))].map((v)=> (
                    <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 w-full md:w-24 min-w-0">
              <Label className="text-xs font-medium text-muted-foreground opacity-0 select-none" aria-hidden>Reset</Label>
              <Button
                variant="outline"
                className="h-9 w-full md:ml-auto"
                onClick={() => { setF5Q(''); setF5Err(''); setF5State(''); setF5Donor(''); }}
              >{t('f5.filters.reset')}</Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('f5.headers.err')}</TableHead>
                    <TableHead>{t('f5.headers.state')}</TableHead>
                    <TableHead>{t('f5.headers.donor')}</TableHead>
                    <TableHead>{t('f5.headers.report_date')}</TableHead>
                    <TableHead className="text-right">{t('f5.headers.activities')}</TableHead>
                    <TableHead>{t('f5.headers.updated')}</TableHead>
                    <TableHead>{t('f5.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f5Loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6">{t('f5.loading')}</TableCell></TableRow>
                  ) : f5Rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">{t('f5.empty')}</TableCell></TableRow>
                  ) : f5Rows
                    .filter(r => !f5Q || [r.err_name, r.state, r.donor].some(v => (v||'').toLowerCase().includes(f5Q.toLowerCase())))
                    .filter(r => !f5Err || r.err_name === f5Err)
                    .filter(r => !f5State || r.state === f5State)
                    .filter(r => !f5Donor || r.donor === f5Donor)
                    .map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.err_name || '-'}</TableCell>
                      <TableCell>{r.state || '-'}</TableCell>
                      <TableCell>{r.donor || '-'}</TableCell>
                      <TableCell>{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-right">{Number(r.activities_count || 0).toLocaleString()}</TableCell>
                      <TableCell>{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        {canViewF5 && (
                        <Button variant="outline" size="sm" onClick={()=>{ setViewF5Id(r.id); setViewF5Open(true) }}>{t('f5.view')}</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <UploadF5Modal open={uploadF5Open} onOpenChange={setUploadF5Open} onSaved={loadF5} />
          <ViewF5Modal reportId={viewF5Id} open={viewF5Open} onOpenChange={(v)=>{ setViewF5Open(v); if (!v) setViewF5Id(null) }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function F4F5ReportingPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6">Loading...</div>}>
      <F4F5ReportingPageContent />
    </Suspense>
  )
}


