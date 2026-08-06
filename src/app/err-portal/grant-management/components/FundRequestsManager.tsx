'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  FSP_STATUSES,
  TRANSFER_PURPOSES,
  TRANSFER_STATUSES,
  suggestFundRequestId,
} from '@/lib/grantManagement/fundTransferHelpers'

type Fsp = {
  id: string
  name: string
  status: string
  contact_person: string | null
  contact_email: string | null
  total_funds?: number
  activity_funds?: number
  fees?: number
}

type GrantOption = { id: string; grant_id: string }

type DecisionOption = {
  decision_id_proposed: string
  decision_date: string | null
  partner: string | null
  decision_amount: number | null
  sum_allocation_amount: number | null
  restriction: string | null
  grant_name: string | null
}

type Transfer = {
  id: string
  transfer_id: string
  grant_id: string | null
  fsp_id: string | null
  purpose: string | null
  status: string | null
  activity_amount: number | null
  transfer_fee_amount: number | null
  transfer_amount?: number | null
  transfer_received_date: string | null
  decision_id_proposed: string | null
  comment: string | null
}

type FundRequest = {
  id: string
  request_id: string
  date_submitted: string | null
  requested_amount: number | null
  partner_name: string | null
  file_name: string | null
  file_link: string | null
  decision_ids: string[]
  transfer_count: number
  transfer_amount_rollup: number
  variance: number | null
  transfers: Transfer[]
}

const money = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const emptyFrForm = {
  request_id: '',
  date_submitted: '',
  requested_amount: '',
  partner_name: '',
  file_name: '',
  file_link: '',
  decision_ids: [] as string[],
}

const emptyTsForm = {
  grant_id: '',
  fsp_id: '',
  purpose: 'ERR Activity Plans',
  status: 'Requested',
  activity_amount: '',
  transfer_fee_amount: '',
  transfer_received_date: '',
  comment: '',
}

const emptyFspForm = {
  name: '',
  status: 'Prospect',
  contact_person: '',
  contact_email: '',
}

export default function FundRequestsManager() {
  const [requests, setRequests] = useState<FundRequest[]>([])
  const [fsps, setFsps] = useState<Fsp[]>([])
  const [grants, setGrants] = useState<GrantOption[]>([])
  const [decisions, setDecisions] = useState<DecisionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const [frOpen, setFrOpen] = useState(false)
  const [editingFr, setEditingFr] = useState<FundRequest | null>(null)
  const [frForm, setFrForm] = useState(emptyFrForm)

  const [tsOpen, setTsOpen] = useState(false)
  const [tsParentId, setTsParentId] = useState<string | null>(null)
  const [editingTs, setEditingTs] = useState<Transfer | null>(null)
  const [tsForm, setTsForm] = useState(emptyTsForm)

  const [fspOpen, setFspOpen] = useState(false)
  const [editingFsp, setEditingFsp] = useState<Fsp | null>(null)
  const [fspForm, setFspForm] = useState(emptyFspForm)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [frRes, fspRes, grantRes, decRes] = await Promise.all([
        fetch('/api/fund-requests', { cache: 'no-store' }),
        fetch('/api/fsps', { cache: 'no-store' }),
        fetch('/api/grants', { cache: 'no-store' }),
        fetch('/api/distribution-decisions', { cache: 'no-store' }),
      ])
      if (frRes.ok) setRequests(await frRes.json())
      if (fspRes.ok) setFsps(await fspRes.json())
      if (grantRes.ok) {
        const g = await grantRes.json()
        setGrants((g || []).map((x: GrantOption) => ({ id: x.id, grant_id: x.grant_id })))
      }
      if (decRes.ok) {
        const d = await decRes.json()
        const list = Array.isArray(d) ? d : []
        setDecisions(
          list
            .map(
              (x: {
                decision_id_proposed?: string
                decision_date?: string | null
                partner?: string | null
                decision_amount?: number | null
                sum_allocation_amount?: number | null
                restriction?: string | null
                grant_name?: string | null
              }) => ({
                decision_id_proposed: x.decision_id_proposed || '',
                decision_date: x.decision_date ?? null,
                partner: x.partner ?? null,
                decision_amount: x.decision_amount ?? null,
                sum_allocation_amount: x.sum_allocation_amount ?? null,
                restriction: x.restriction ?? null,
                grant_name: x.grant_name ?? null,
              })
            )
            .filter((x: DecisionOption) => x.decision_id_proposed)
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreateFr = () => {
    setEditingFr(null)
    const today = new Date().toISOString().slice(0, 10)
    setFrForm({
      ...emptyFrForm,
      date_submitted: today,
      partner_name: 'P2H',
      request_id:
        suggestFundRequestId(
          'P2H',
          today,
          requests.map((r) => r.request_id)
        ) || '',
    })
    setFrOpen(true)
  }

  const openEditFr = (fr: FundRequest) => {
    setEditingFr(fr)
    setFrForm({
      request_id: fr.request_id,
      date_submitted: fr.date_submitted || '',
      requested_amount: fr.requested_amount?.toString() || '',
      partner_name: fr.partner_name || '',
      file_name: fr.file_name || '',
      file_link: fr.file_link || '',
      decision_ids: fr.decision_ids || [],
    })
    setFrOpen(true)
  }

  const updateFrPartnerOrDate = (patch: Partial<typeof emptyFrForm>) => {
    setFrForm((prev) => {
      const next = { ...prev, ...patch }
      if (!editingFr) {
        const suggested = suggestFundRequestId(
          next.partner_name,
          next.date_submitted,
          requests.map((r) => r.request_id)
        )
        if (suggested) next.request_id = suggested
      }
      return next
    })
  }

  const saveFr = async () => {
    const payload = {
      request_id: frForm.request_id,
      date_submitted: frForm.date_submitted || null,
      requested_amount: frForm.requested_amount ? Number(frForm.requested_amount) : null,
      partner_name: frForm.partner_name || null,
      file_name: frForm.file_name || null,
      file_link: frForm.file_link || null,
      decision_ids: frForm.decision_ids,
    }
    const res = editingFr
      ? await fetch(`/api/fund-requests/${editingFr.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/fund-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to save fund request')
      return
    }
    setFrOpen(false)
    await load()
  }

  const deleteFr = async (id: string) => {
    if (!confirm('Delete this fund request and its transfer segments?')) return
    const res = await fetch(`/api/fund-requests/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('Failed to delete fund request')
      return
    }
    await load()
  }

  const openCreateTs = (fundRequestId: string) => {
    setTsParentId(fundRequestId)
    setEditingTs(null)
    setTsForm(emptyTsForm)
    setTsOpen(true)
  }

  const openEditTs = (fundRequestId: string, t: Transfer) => {
    setTsParentId(fundRequestId)
    setEditingTs(t)
    setTsForm({
      grant_id: t.grant_id || '',
      fsp_id: t.fsp_id || '',
      purpose: t.purpose || 'ERR Activity Plans',
      status: t.status || 'Requested',
      activity_amount: t.activity_amount?.toString() || '',
      transfer_fee_amount: t.transfer_fee_amount?.toString() || '',
      transfer_received_date: t.transfer_received_date || '',
      comment: t.comment || '',
    })
    setTsOpen(true)
  }

  const saveTs = async () => {
    if (!tsParentId) return
    const payload = {
      fund_request_id: tsParentId,
      grant_id: tsForm.grant_id || null,
      fsp_id: tsForm.fsp_id || null,
      purpose: tsForm.purpose || null,
      status: tsForm.status || null,
      activity_amount: tsForm.activity_amount ? Number(tsForm.activity_amount) : null,
      transfer_fee_amount: tsForm.transfer_fee_amount ? Number(tsForm.transfer_fee_amount) : null,
      transfer_received_date: tsForm.transfer_received_date || null,
      comment: tsForm.comment || null,
    }
    const res = editingTs
      ? await fetch(`/api/transfer-segments/${editingTs.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/transfer-segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to save transfer')
      return
    }
    setTsOpen(false)
    await load()
  }

  const deleteTs = async (id: string) => {
    if (!confirm('Delete this transfer segment?')) return
    const res = await fetch(`/api/transfer-segments/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('Failed to delete transfer')
      return
    }
    await load()
  }

  const openCreateFsp = () => {
    setEditingFsp(null)
    setFspForm(emptyFspForm)
    setFspOpen(true)
  }

  const openEditFsp = (f: Fsp) => {
    setEditingFsp(f)
    setFspForm({
      name: f.name,
      status: f.status,
      contact_person: f.contact_person || '',
      contact_email: f.contact_email || '',
    })
    setFspOpen(true)
  }

  const saveFsp = async () => {
    const payload = {
      name: fspForm.name,
      status: fspForm.status,
      contact_person: fspForm.contact_person || null,
      contact_email: fspForm.contact_email || null,
    }
    const res = editingFsp
      ? await fetch(`/api/fsps/${editingFsp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/fsps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to save FSP')
      return
    }
    setFspOpen(false)
    await load()
  }

  const deleteFsp = async (id: string) => {
    if (!confirm('Delete this FSP? Transfers will keep data but lose the FSP link.')) return
    const res = await fetch(`/api/fsps/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('Failed to delete FSP')
      return
    }
    await load()
  }

  const fspName = (id: string | null) => fsps.find((f) => f.id === id)?.name || '—'

  const toggleDecision = (id: string) => {
    setFrForm((prev) => ({
      ...prev,
      decision_ids: prev.decision_ids.includes(id)
        ? prev.decision_ids.filter((d) => d !== id)
        : [...prev.decision_ids, id],
    }))
  }

  /** Decisions already linked to any fund request (except the one being edited). */
  const linkedElsewhere = useMemo(() => {
    const set = new Set<string>()
    for (const fr of requests) {
      if (editingFr && fr.id === editingFr.id) continue
      for (const id of fr.decision_ids || []) set.add(id)
    }
    return set
  }, [requests, editingFr])

  const selectableDecisions = useMemo(() => {
    return decisions.filter(
      (d) =>
        !linkedElsewhere.has(d.decision_id_proposed) ||
        frForm.decision_ids.includes(d.decision_id_proposed)
    )
  }, [decisions, linkedElsewhere, frForm.decision_ids])

  const totalPages = Math.max(1, Math.ceil(requests.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedRequests = requests.slice(startIndex, endIndex)

  const requestTotals = {
    requested: requests.reduce((s, r) => s + (Number(r.requested_amount) || 0), 0),
    received: requests.reduce((s, r) => s + (Number(r.transfer_amount_rollup) || 0), 0),
    variance: requests.reduce((s, r) => s + (Number(r.variance) || 0), 0),
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [requests.length])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            Fund Requests
            {requests.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({requests.length} {requests.length === 1 ? 'request' : 'requests'})
              </span>
            )}
          </CardTitle>
          <Dialog open={frOpen} onOpenChange={setFrOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 text-xs" onClick={openCreateFr}>
                <Plus className="h-3 w-3 mr-1" /> New request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingFr ? 'Edit fund request' : 'Create fund request'}</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                A fund request asks for money for one or more decisions. After saving, add a{' '}
                <span className="font-medium text-foreground">transfer segment</span> to record
                which <span className="font-medium text-foreground">grant</span> the money comes
                from and which <span className="font-medium text-foreground">FSP</span> handled it.
              </p>
              <div className="space-y-3">
                <div>
                  <Label>Partner *</Label>
                  <Select
                    value={frForm.partner_name || undefined}
                    onValueChange={(v) => updateFrPartnerOrDate({ partner_name: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select partner" />
                    </SelectTrigger>
                    <SelectContent>
                      {['P2H', 'Avaaz', 'Gisa', 'DKH', 'VTL'].map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date submitted *</Label>
                  <Input
                    type="date"
                    value={frForm.date_submitted}
                    onChange={(e) => updateFrPartnerOrDate({ date_submitted: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Request ID (auto)</Label>
                  <Input
                    value={frForm.request_id}
                    readOnly={!editingFr}
                    className={!editingFr ? 'bg-muted/40 font-mono text-xs' : 'font-mono text-xs'}
                    onChange={(e) => setFrForm({ ...frForm, request_id: e.target.value })}
                  />
                  {!editingFr && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Pattern: YYYY-Partner-NNN (matches existing Airtable IDs)
                    </p>
                  )}
                </div>
                <div>
                  <Label>Requested amount (USD)</Label>
                  <Input
                    type="number"
                    value={frForm.requested_amount}
                    onChange={(e) => setFrForm({ ...frForm, requested_amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label>File name</Label>
                  <Input
                    value={frForm.file_name}
                    onChange={(e) => setFrForm({ ...frForm, file_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>File link</Label>
                  <Input
                    value={frForm.file_link}
                    onChange={(e) => setFrForm({ ...frForm, file_link: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Linked decisions</Label>
                  <p className="text-[11px] text-muted-foreground mb-1">
                    Only decisions not already linked to another fund request are shown.
                  </p>
                  <div className="max-h-56 overflow-y-auto border rounded">
                    {selectableDecisions.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">
                        {decisions.length === 0
                          ? 'No decisions loaded'
                          : 'No unlinked decisions available'}
                      </div>
                    ) : (
                      <Table className="text-xs [&_th]:py-1 [&_th]:px-2 [&_td]:py-0.5 [&_td]:px-2">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-8" />
                            <TableHead>Decision ID</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Partner</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Restriction</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectableDecisions.map((d) => {
                            const checked = frForm.decision_ids.includes(d.decision_id_proposed)
                            return (
                              <TableRow
                                key={d.decision_id_proposed}
                                className={checked ? 'bg-muted/40' : undefined}
                              >
                                <TableCell>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleDecision(d.decision_id_proposed)}
                                  />
                                </TableCell>
                                <TableCell className="font-mono max-w-[160px] truncate" title={d.decision_id_proposed}>
                                  {d.decision_id_proposed}
                                </TableCell>
                                <TableCell className="whitespace-nowrap">
                                  {d.decision_date || '—'}
                                </TableCell>
                                <TableCell>{d.partner || '—'}</TableCell>
                                <TableCell className="text-right whitespace-nowrap">
                                  {money(d.decision_amount)}
                                </TableCell>
                                <TableCell className="max-w-[100px] truncate" title={d.restriction || undefined}>
                                  {d.restriction || '—'}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                  {frForm.decision_ids.length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {frForm.decision_ids.length} decision
                      {frForm.decision_ids.length === 1 ? '' : 's'} selected
                    </p>
                  )}
                </div>
                <Button onClick={saveFr} className="w-full" disabled={!frForm.request_id.trim()}>
                  Save
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : (
            <Table className="text-xs [&_th]:py-1.5 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2">
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead>Request ID</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Requested</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Transfers</TableHead>
                  <TableHead />
                </TableRow>
                {requests.length > 0 && (
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead />
                    <TableHead className="font-semibold text-foreground whitespace-nowrap">
                      Total ({requests.length} {requests.length === 1 ? 'row' : 'rows'})
                    </TableHead>
                    <TableHead />
                    <TableHead />
                    <TableHead className="text-right font-semibold text-foreground whitespace-nowrap">
                      {money(requestTotals.requested)}
                    </TableHead>
                    <TableHead className="text-right font-semibold text-foreground whitespace-nowrap">
                      {money(requestTotals.received)}
                    </TableHead>
                    <TableHead className="text-right font-semibold text-foreground whitespace-nowrap">
                      {money(requestTotals.variance)}
                    </TableHead>
                    <TableHead />
                    <TableHead />
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {paginatedRequests.map((fr) => (
                  <React.Fragment key={fr.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setExpanded(expanded === fr.id ? null : fr.id)}
                        >
                          {expanded === fr.id ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{fr.request_id}</TableCell>
                      <TableCell>{fr.partner_name || '—'}</TableCell>
                      <TableCell>{fr.date_submitted || '—'}</TableCell>
                      <TableCell className="text-right">{money(fr.requested_amount)}</TableCell>
                      <TableCell className="text-right">{money(fr.transfer_amount_rollup)}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            fr.variance != null && Math.abs(fr.variance) > 0.01
                              ? 'text-amber-700'
                              : undefined
                          }
                        >
                          {money(fr.variance)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {fr.transfer_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="space-x-1 whitespace-nowrap">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditFr(fr)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteFr(fr.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded === fr.id && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium">Transfer segments</div>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreateTs(fr.id)}>
                              <Plus className="h-3 w-3 mr-1" /> Add transfer (grant + FSP)
                            </Button>
                          </div>
                          {(fr.decision_ids || []).length > 0 && (
                            <div className="text-xs text-muted-foreground mb-2">
                              Decisions: {fr.decision_ids.join(', ')}
                            </div>
                          )}
                          <Table className="text-xs [&_th]:py-1 [&_th]:px-2 [&_td]:py-0.5 [&_td]:px-2">
                            <TableHeader>
                              <TableRow>
                                <TableHead>Transfer ID</TableHead>
                                <TableHead>Grant</TableHead>
                                <TableHead>FSP</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Activity</TableHead>
                                <TableHead className="text-right">Fee</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(fr.transfers || []).length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={8} className="text-xs text-muted-foreground">
                                    No transfers yet
                                  </TableCell>
                                </TableRow>
                              )}
                              {(fr.transfers || []).map((t) => (
                                <TableRow key={t.id}>
                                  <TableCell>{t.transfer_id}</TableCell>
                                  <TableCell>{t.grant_id || '—'}</TableCell>
                                  <TableCell>{fspName(t.fsp_id)}</TableCell>
                                  <TableCell>{t.status || '—'}</TableCell>
                                  <TableCell className="text-right">
                                    {money(t.activity_amount)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {money(t.transfer_fee_amount)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {money(t.transfer_amount)}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openEditTs(fr.id, t)}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => deleteTs(t.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
                {!loading && requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground text-xs">
                      No fund requests yet. Apply the DB migration, seed FSPs, then create a request.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          {requests.length > itemsPerPage && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-xs text-muted-foreground">
                Showing {startIndex + 1}-{Math.min(endIndex, requests.length)} of {requests.length}{' '}
                requests
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="text-xs">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">FSPs</CardTitle>
          <Button size="sm" className="h-7 text-xs" onClick={openCreateFsp}>
            <Plus className="h-3 w-3 mr-1" /> New FSP
          </Button>
        </CardHeader>
        <CardContent>
          <Table className="text-xs [&_th]:py-1.5 [&_th]:px-2 [&_td]:py-1 [&_td]:px-2">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Activity</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fsps.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {f.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {f.contact_person || f.contact_email || '—'}
                  </TableCell>
                  <TableCell className="text-right">{money(f.total_funds)}</TableCell>
                  <TableCell className="text-right">{money(f.activity_funds)}</TableCell>
                  <TableCell className="text-right">{money(f.fees)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditFsp(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteFsp(f.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {fsps.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-xs text-muted-foreground">
                    No FSPs yet. Run the seed script after applying the migration.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={tsOpen} onOpenChange={setTsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTs ? 'Edit transfer' : 'Add transfer'}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Record money received against this fund request: choose the{' '}
            <span className="font-medium text-foreground">grant</span> (source) and{' '}
            <span className="font-medium text-foreground">FSP</span> (who moved/held it).
          </p>
          <div className="space-y-3">
            <div>
              <Label>Grant *</Label>
              <Select
                value={tsForm.grant_id || undefined}
                onValueChange={(v) => setTsForm({ ...tsForm, grant_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select grant" />
                </SelectTrigger>
                <SelectContent>
                  {grants.map((g) => (
                    <SelectItem key={g.id} value={g.grant_id}>
                      {g.grant_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>FSP *</Label>
              <Select
                value={tsForm.fsp_id || undefined}
                onValueChange={(v) => setTsForm({ ...tsForm, fsp_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select FSP" />
                </SelectTrigger>
                <SelectContent>
                  {fsps.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Purpose</Label>
              <Select
                value={tsForm.purpose}
                onValueChange={(v) => setTsForm({ ...tsForm, purpose: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFER_PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={tsForm.status}
                onValueChange={(v) => setTsForm({ ...tsForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Activity amount</Label>
              <Input
                type="number"
                value={tsForm.activity_amount}
                onChange={(e) => setTsForm({ ...tsForm, activity_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Transfer fee</Label>
              <Input
                type="number"
                value={tsForm.transfer_fee_amount}
                onChange={(e) => setTsForm({ ...tsForm, transfer_fee_amount: e.target.value })}
              />
            </div>
            <div>
              <Label>Received date</Label>
              <Input
                type="date"
                value={tsForm.transfer_received_date}
                onChange={(e) => setTsForm({ ...tsForm, transfer_received_date: e.target.value })}
              />
            </div>
            <div>
              <Label>Comment</Label>
              <Input
                value={tsForm.comment}
                onChange={(e) => setTsForm({ ...tsForm, comment: e.target.value })}
              />
            </div>
            <Button onClick={saveTs} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={fspOpen} onOpenChange={setFspOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingFsp ? 'Edit FSP' : 'Create FSP'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input
                value={fspForm.name}
                onChange={(e) => setFspForm({ ...fspForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={fspForm.status}
                onValueChange={(v) => setFspForm({ ...fspForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FSP_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contact person</Label>
              <Input
                value={fspForm.contact_person}
                onChange={(e) => setFspForm({ ...fspForm, contact_person: e.target.value })}
              />
            </div>
            <div>
              <Label>Contact email</Label>
              <Input
                value={fspForm.contact_email}
                onChange={(e) => setFspForm({ ...fspForm, contact_email: e.target.value })}
              />
            </div>
            <Button onClick={saveFsp} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
