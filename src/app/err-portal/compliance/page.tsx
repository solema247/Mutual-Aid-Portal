'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { FileText, Eye, ShieldCheck, ShieldAlert, IdCard, Siren, Upload } from 'lucide-react'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { supabase } from '@/lib/supabaseClient'

type FlagType = 'missing_id' | 'sanctions_match'

interface Screening {
  id: string
  project_id: string
  names: string[]
  status: 'pending_screening' | 'cleared' | 'flagged' | 'auto_approved'
  flag_type: FlagType | null
  flag_note: string | null
  alerted_at: string | null
  screened_at: string | null
  finance_review_status: 'pending' | 'approved' | 'rejected' | null
  finance_review_note: string | null
  finance_reviewed_at: string | null
  created_at: string
  err_id: string | null
  err_name: string | null
  date: string | null
  state: string | null
  locality: string | null
  project_status: string | null
  funding_status: string | null
  banking_details: string | null
  intended_beneficiaries: string | null
  project_objectives: string | null
  total_amount: number
  temp_file_key: string | null
  identity_document_file_key: string | null
}

function StatusBadge({ s }: { s: Screening }) {
  if (s.status === 'pending_screening') {
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pending screening</Badge>
  }
  if (s.status === 'auto_approved') {
    return <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">Auto-approved</Badge>
  }
  if (s.status === 'cleared') {
    return <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">Cleared</Badge>
  }
  if (s.flag_type === 'sanctions_match') {
    if (s.finance_review_status === 'rejected') {
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Sanctions flag dismissed</Badge>
    }
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-semibold">
        PAYMENT STOPPED — sanctions match
      </Badge>
    )
  }
  if (s.flag_type === 'missing_id') {
    if (s.finance_review_status === 'approved') {
      return <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">Missing ID — document uploaded</Badge>
    }
    if (s.finance_review_status === 'rejected') {
      return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Missing ID flag dismissed</Badge>
    }
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Missing ID — awaiting upload</Badge>
  }
  if (s.finance_review_status === 'approved') {
    return <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-500">Flagged — finance approved</Badge>
  }
  if (s.finance_review_status === 'rejected') {
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Flag dismissed</Badge>
  }
  return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Flagged — pending finance review</Badge>
}

const ITEMS_PER_PAGE = 10

function PaginatedScreeningsTable({
  rows,
  emptyText,
  onView,
}: {
  rows: Screening[]
  emptyText: string
  onView: (s: Screening) => void
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(rows.length / ITEMS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const pageRows = rows.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [rows.length])

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table className="text-xs min-w-[700px]">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:px-2 [&>th]:text-xs">
                <TableHead className="px-2">ERR ID</TableHead>
                <TableHead className="px-2">Date</TableHead>
                <TableHead className="px-2">State</TableHead>
                <TableHead className="px-2">Locality</TableHead>
                <TableHead className="px-2">Payee names</TableHead>
                <TableHead className="text-right px-2">Amount</TableHead>
                <TableHead className="px-2">Status</TableHead>
                <TableHead className="px-2">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                    {emptyText}
                  </TableCell>
                </TableRow>
              )}
              {pageRows.map(s => (
                <TableRow
                  key={s.id}
                  className={`[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs ${
                    s.flag_type === 'sanctions_match' && s.finance_review_status === 'pending'
                      ? 'bg-red-50'
                      : ''
                  }`}
                >
                  <TableCell className="whitespace-nowrap">{s.err_id || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.date ? new Date(s.date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{s.state || '—'}</TableCell>
                  <TableCell className="whitespace-nowrap max-w-[100px] truncate" title={s.locality || ''}>
                    {s.locality || '—'}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    {s.names.length > 0 ? (
                      <span className="truncate block" title={s.names.join(', ')}>
                        {s.names.join(', ')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">No names extracted</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {s.total_amount ? s.total_amount.toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StatusBadge s={s} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs px-2"
                      onClick={() => onView(s)}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View F1
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rows.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between px-1">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, rows.length)} of {rows.length}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(safePage - 1)}
              disabled={safePage === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground self-center">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(safePage + 1)}
              disabled={safePage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompliancePage() {
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('compliance_view_page')
  const canScreen = can('compliance_screen')
  const canFinanceReview = can('compliance_finance_review')

  const [screenings, setScreenings] = useState<Screening[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selected, setSelected] = useState<Screening | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionInfo, setActionInfo] = useState<string | null>(null)
  const idFileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!permissionsLoading && !canViewPage) {
      router.replace('/err-portal')
    }
  }, [permissionsLoading, canViewPage, router])

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/compliance/queue')
      if (!res.ok) throw new Error('Failed to fetch compliance queue')
      const data = await res.json()
      setScreenings(data)
    } catch (e) {
      console.error('Error fetching compliance queue:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const openDetail = (s: Screening) => {
    setSelected(s)
    setNote('')
    setActionError(null)
    setActionInfo(null)
    setDialogOpen(true)
  }

  const submitDecision = async (action: 'clear' | 'flag', flagType?: FlagType) => {
    if (!selected) return
    if (action === 'flag') {
      if (!flagType) {
        setActionError('Choose a flag type: Missing ID or Sanctions match.')
        return
      }
      if (!note.trim()) {
        setActionError('Please add a note explaining the flag.')
        return
      }
    }
    setActionError(null)
    setActionInfo(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/compliance/${selected.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: note.trim() || undefined,
          flag_type: action === 'flag' ? flagType : undefined
        })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        setActionError(err.error || `Failed to ${action} (HTTP ${res.status})`)
        return
      }
      const result = await res.json()
      if (result.alert) setActionInfo(result.alert)
      setDialogOpen(false)
      setSelected(null)
      setNote('')
      await fetchQueue()
    } catch (e) {
      console.error('Error recording decision:', e)
      setActionError('Failed to record decision — check your connection and try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitFinanceReview = async (action: 'dismiss' | 'approve') => {
    if (!selected) return
    setActionError(null)
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/compliance/${selected.id}/finance-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note.trim() || undefined })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        setActionError(err.error || 'Failed to record finance review')
        return
      }
      setDialogOpen(false)
      await fetchQueue()
    } catch (e) {
      console.error('Error recording finance review:', e)
      setActionError('Failed to record finance review')
    } finally {
      setIsSubmitting(false)
    }
  }

  const uploadIdentityDocument = async (file: File) => {
    if (!selected) return
    setActionError(null)
    setIsSubmitting(true)
    try {
      const ext = file.name.split('.').pop() || 'pdf'
      const key = `compliance-ids/${selected.project_id}/${Date.now()}-${file.name.replace(/\s+/g, '_') || `id.${ext}`}`
      const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
      if (upErr) {
        setActionError(`Upload failed: ${upErr.message}`)
        return
      }
      const res = await fetch(`/api/compliance/${selected.id}/upload-id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_key: key, note: note.trim() || undefined })
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }))
        setActionError(err.error || 'Failed to attach ID to F1')
        return
      }
      setDialogOpen(false)
      await fetchQueue()
    } catch (e) {
      console.error('Error uploading ID:', e)
      setActionError('Failed to upload identity document')
    } finally {
      setIsSubmitting(false)
      if (idFileInputRef.current) idFileInputRef.current.value = ''
    }
  }

  const openFile = async (fileKey: string) => {
    try {
      const res = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(fileKey)}`)
      if (!res.ok) throw new Error('Failed to get file URL')
      const { url } = await res.json()
      if (url) window.open(url, '_blank')
      else alert('File not available')
    } catch (e) {
      console.error('Error opening file:', e)
      alert('Failed to open file')
    }
  }

  if (!canViewPage) return null
  if (isLoading) return <div className="text-center py-8">Loading...</div>

  const pending = screenings.filter(s => s.status === 'pending_screening')
  const financeQueue = screenings.filter(
    s => s.status === 'flagged' && s.finance_review_status === 'pending'
  )
  const sanctionsAlerts = screenings.filter(
    s =>
      s.status === 'flagged' &&
      s.flag_type === 'sanctions_match' &&
      s.finance_review_status === 'pending'
  )
  const history = screenings.filter(
    s =>
      s.status !== 'pending_screening' &&
      !(s.status === 'flagged' && s.finance_review_status === 'pending')
  )

  const showScreeningActions =
    canScreen && selected?.status === 'pending_screening'
  const showMissingIdFinance =
    canFinanceReview &&
    selected?.status === 'flagged' &&
    selected?.flag_type === 'missing_id' &&
    selected?.finance_review_status === 'pending'
  const showSanctionsFinance =
    canFinanceReview &&
    selected?.status === 'flagged' &&
    selected?.flag_type === 'sanctions_match' &&
    selected?.finance_review_status === 'pending'
  const showLegacyFinance =
    canFinanceReview &&
    selected?.status === 'flagged' &&
    !selected?.flag_type &&
    selected?.finance_review_status === 'pending'

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Visual Compliance</h2>
        <Button variant="outline" onClick={() => router.push('/err-portal')}>
          Back
        </Button>
      </div>

      {sanctionsAlerts.length > 0 && (
        <div className="rounded-md border-2 border-red-600 bg-red-50 px-4 py-3 text-red-950">
          <div className="flex items-start gap-2">
            <Siren className="h-5 w-5 mt-0.5 shrink-0 text-red-600" />
            <div>
              <div className="font-semibold text-sm">
                RED ALERT — {sanctionsAlerts.length} payment{sanctionsAlerts.length === 1 ? '' : 's'} must be stopped
              </div>
              <p className="text-sm mt-1">
                Potential Descartes / sanctions list match flagged. Notify Finance team, Yara, Josh, Nihal, and Santiago.
                {' '}
                {sanctionsAlerts.map(s => s.err_id || s.project_id).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>OFAC / Descartes Screening</CardTitle>
          <p className="text-sm text-muted-foreground">
            Finance team screens payee names. Flag as <strong>Missing ID</strong> (finance uploads the document)
            or <strong>Sanctions match</strong> (payment stopped — red alert). Clear when the name is fine.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="queue" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="queue">
                Screening queue{pending.length > 0 ? ` (${pending.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="finance">
                Finance review{financeQueue.length > 0 ? ` (${financeQueue.length})` : ''}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

            <TabsContent value="queue" className="mt-6">
              <PaginatedScreeningsTable
                rows={pending}
                emptyText="No F1s waiting for screening"
                onView={openDetail}
              />
            </TabsContent>

            <TabsContent value="finance" className="mt-6">
              <PaginatedScreeningsTable
                rows={financeQueue}
                emptyText="No flagged F1s waiting for finance review"
                onView={openDetail}
              />
            </TabsContent>

            <TabsContent value="history" className="mt-6">
              <PaginatedScreeningsTable
                rows={history}
                emptyText="No screened F1s yet"
                onView={openDetail}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              F1 Compliance Review {selected?.err_id ? `— ${selected.err_id}` : ''}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              {selected.flag_type === 'sanctions_match' &&
                selected.finance_review_status === 'pending' && (
                <div className="rounded-md border-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-950 font-medium">
                  PAYMENT MUST BE STOPPED — potential Descartes / sanctions list match.
                  Alert recipients: Finance team, Yara, Josh, Nihal, Santiago.
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge s={selected} />
                {selected.funding_status && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {selected.funding_status}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">ERR</div>
                  <div>{selected.err_name || selected.err_id || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Date</div>
                  <div>{selected.date ? new Date(selected.date).toLocaleDateString() : '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">State / Locality</div>
                  <div>{[selected.state, selected.locality].filter(Boolean).join(' — ') || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Requested amount</div>
                  <div>{selected.total_amount ? selected.total_amount.toLocaleString() : '—'}</div>
                </div>
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Payee names to screen</div>
                {selected.names.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.names.map(name => (
                      <Badge key={name} variant="secondary" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No names could be extracted automatically — screen banking details manually.
                  </p>
                )}
              </div>

              <div>
                <div className="text-xs text-muted-foreground mb-1">Banking details</div>
                <pre className="text-sm whitespace-pre-wrap bg-muted rounded-md p-3 max-h-48 overflow-y-auto font-sans">
                  {selected.banking_details || '—'}
                </pre>
              </div>

              {selected.intended_beneficiaries && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Intended beneficiaries</div>
                  <pre className="text-sm whitespace-pre-wrap bg-muted rounded-md p-3 max-h-32 overflow-y-auto font-sans">
                    {selected.intended_beneficiaries}
                  </pre>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {selected.temp_file_key && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openFile(selected.temp_file_key as string)}
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Open original F1 file
                  </Button>
                )}
                {selected.identity_document_file_key && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openFile(selected.identity_document_file_key as string)}
                  >
                    <IdCard className="w-4 h-4 mr-1" />
                    Open uploaded ID
                  </Button>
                )}
              </div>

              {selected.flag_note && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Screening flag note</div>
                  <p className="text-sm bg-red-50 text-red-900 rounded-md p-3">{selected.flag_note}</p>
                </div>
              )}

              {selected.finance_review_note && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Finance review note</div>
                  <p className="text-sm bg-muted rounded-md p-3">{selected.finance_review_note}</p>
                </div>
              )}

              {(showScreeningActions ||
                showMissingIdFinance ||
                showSanctionsFinance ||
                showLegacyFinance) && (
                <div className="space-y-2 border-t pt-4 sticky bottom-0 bg-white dark:bg-slate-950 pb-1">
                  <div className="text-xs text-muted-foreground">
                    {showScreeningActions
                      ? 'Note (required when flagging)'
                      : 'Finance note (optional)'}
                  </div>
                  <Textarea
                    value={note}
                    onChange={e => {
                      setNote(e.target.value)
                      if (actionError) setActionError(null)
                    }}
                    placeholder={
                      showScreeningActions
                        ? 'e.g. No national ID attached / Possible Descartes list match for …'
                        : 'e.g. ID verified and uploaded / Flag raised in error — wrong person'
                    }
                    rows={2}
                  />
                  {actionError && (
                    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                      {actionError}
                    </p>
                  )}
                  {actionInfo && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      {actionInfo}
                    </p>
                  )}

                  {showScreeningActions && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => submitDecision('flag', 'missing_id')}
                      >
                        <IdCard className="w-4 h-4 mr-1" />
                        Flag: Missing ID
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isSubmitting}
                        onClick={() => submitDecision('flag', 'sanctions_match')}
                      >
                        <Siren className="w-4 h-4 mr-1" />
                        Flag: Sanctions match
                      </Button>
                      <Button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => submitDecision('clear')}
                      >
                        <ShieldCheck className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                    </div>
                  )}

                  {showMissingIdFinance && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <input
                        ref={idFileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,image/*,application/pdf"
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) void uploadIdentityDocument(file)
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => submitFinanceReview('dismiss')}
                      >
                        Dismiss flag (raised in error)
                      </Button>
                      <Button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => idFileInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        {isSubmitting ? 'Uploading…' : 'Upload ID to F1'}
                      </Button>
                    </div>
                  )}

                  {showSanctionsFinance && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => submitFinanceReview('dismiss')}
                      >
                        Dismiss flag (raised in error)
                      </Button>
                      <Button type="button" variant="destructive" disabled>
                        <ShieldAlert className="w-4 h-4 mr-1" />
                        Payment remains stopped
                      </Button>
                    </div>
                  )}

                  {showLegacyFinance && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isSubmitting}
                        onClick={() => submitFinanceReview('dismiss')}
                      >
                        Dismiss flag
                      </Button>
                      <Button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => submitFinanceReview('approve')}
                      >
                        Approve — allow commit
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
