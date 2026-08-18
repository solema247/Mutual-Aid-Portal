'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  computeTransferFeeAmount,
  suggestFundRequestId,
} from '@/lib/grantManagement/fundTransferHelpers'

type Fsp = {
  id: string
  name: string
  status: string
  contact_person: string | null
  contact_email: string | null
  transfer_fee_percent?: number | null
  treasury_in_usd?: number | null
  treasury_out_usd?: number | null
  balance?: number
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

/** Allow requests to exceed decision amount by this factor (e.g. transfer fees). */
const FUNDING_CAPACITY_MARGIN = 1.05

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
  activity_amount: '',
  comment: '',
}

type NewTsRow = {
  grant_id: string
  fsp_id: string
  purpose: string
  activity_amount: string
}

const emptyNewTsRow = (): NewTsRow => ({
  grant_id: '',
  fsp_id: '',
  purpose: 'ERR Activity Plans',
  activity_amount: '',
})

const emptyFspForm = {
  name: '',
  status: 'Prospect',
  contact_person: '',
  contact_email: '',
  transfer_fee_percent: '',
}

const DECISION_RECENT_DAYS = 90

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function FundRequestsManager() {
  const { t } = useTranslation(['err'])
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
  const [showAllDecisions, setShowAllDecisions] = useState(false)

  const [tsOpen, setTsOpen] = useState(false)
  const [tsParentId, setTsParentId] = useState<string | null>(null)
  const [editingTs, setEditingTs] = useState<Transfer | null>(null)
  const [tsForm, setTsForm] = useState(emptyTsForm)
  const [newTsRows, setNewTsRows] = useState<Record<string, NewTsRow[]>>({})
  const [savingNewTs, setSavingNewTs] = useState(false)

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
    setShowAllDecisions(false)
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
    setShowAllDecisions(false)
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
    setExpanded(fundRequestId)
    setNewTsRows((prev) => ({
      ...prev,
      [fundRequestId]: prev[fundRequestId]?.length
        ? prev[fundRequestId]
        : [emptyNewTsRow()],
    }))
  }

  const openEditTs = (fundRequestId: string, t: Transfer) => {
    setTsParentId(fundRequestId)
    setEditingTs(t)
    setTsForm({
      grant_id: t.grant_id || '',
      fsp_id: t.fsp_id || '',
      purpose: t.purpose || 'ERR Activity Plans',
      activity_amount: t.activity_amount?.toString() || '',
      comment: t.comment || '',
    })
    setTsOpen(true)
  }

  const saveTs = async () => {
    if (!tsParentId || !editingTs) return
    const payload = {
      fund_request_id: tsParentId,
      grant_id: tsForm.grant_id || null,
      fsp_id: tsForm.fsp_id || null,
      purpose: tsForm.purpose || null,
      activity_amount: tsForm.activity_amount ? Number(tsForm.activity_amount) : null,
      comment: tsForm.comment || null,
    }
    const res = await fetch(`/api/transfer-segments/${editingTs.id}`, {
      method: 'PUT',
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

  const validNewTsRows = (rows: NewTsRow[]) =>
    rows.filter((r) => r.grant_id.trim() && r.fsp_id.trim())

  const saveNewTsRows = async (fundRequestId: string) => {
    const rows = validNewTsRows(newTsRows[fundRequestId] || [])
    if (!rows.length) return
    setSavingNewTs(true)
    try {
      for (const row of rows) {
        const res = await fetch('/api/transfer-segments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fund_request_id: fundRequestId,
            grant_id: row.grant_id || null,
            fsp_id: row.fsp_id || null,
            purpose: row.purpose || null,
            status: 'Requested',
            activity_amount: row.activity_amount ? Number(row.activity_amount) : null,
            transfer_received_date: null,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          alert(err.error || 'Failed to save transfer segment')
          return
        }
      }
      setNewTsRows((prev) => {
        const next = { ...prev }
        delete next[fundRequestId]
        return next
      })
      await load()
    } finally {
      setSavingNewTs(false)
    }
  }

  const updateNewTsRow = (fundRequestId: string, idx: number, patch: Partial<NewTsRow>) => {
    setNewTsRows((prev) => ({
      ...prev,
      [fundRequestId]: (prev[fundRequestId] || []).map((r, i) =>
        i === idx ? { ...r, ...patch } : r
      ),
    }))
  }

  const feeForNewRow = (row: NewTsRow) => {
    const activity = row.activity_amount ? Number(row.activity_amount) : null
    if (activity == null || Number.isNaN(activity)) return null
    const fsp = fsps.find((f) => f.id === row.fsp_id)
    return computeTransferFeeAmount(activity, fsp?.transfer_fee_percent ?? 0)
  }

  const updateTsStatus = async (t: Transfer, status: string) => {
    const today = new Date().toISOString().slice(0, 10)
    const transfer_received_date =
      status === 'Received' ? t.transfer_received_date || today : null
    const res = await fetch(`/api/transfer-segments/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, transfer_received_date }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Failed to update status')
      return
    }
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
      transfer_fee_percent:
        f.transfer_fee_percent != null ? String(f.transfer_fee_percent) : '',
    })
    setFspOpen(true)
  }

  const saveFsp = async () => {
    const payload = {
      name: fspForm.name,
      status: fspForm.status,
      contact_person: fspForm.contact_person || null,
      contact_email: fspForm.contact_email || null,
      transfer_fee_percent: fspForm.transfer_fee_percent
        ? Number(fspForm.transfer_fee_percent)
        : null,
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

  const selectedFsp = useMemo(
    () => fsps.find((f) => f.id === tsForm.fsp_id) || null,
    [fsps, tsForm.fsp_id]
  )
  const calculatedTransferFee = useMemo(() => {
    const activity = tsForm.activity_amount ? Number(tsForm.activity_amount) : null
    if (activity == null || Number.isNaN(activity)) return null
    return computeTransferFeeAmount(activity, selectedFsp?.transfer_fee_percent ?? 0)
  }, [tsForm.activity_amount, selectedFsp?.transfer_fee_percent])

  const toggleDecision = (id: string) => {
    setFrForm((prev) => ({
      ...prev,
      decision_ids: prev.decision_ids.includes(id)
        ? prev.decision_ids.filter((d) => d !== id)
        : [...prev.decision_ids, id],
    }))
  }

  const selectableDecisions = useMemo(() => {
    if (showAllDecisions) return decisions
    const cutoff = daysAgoIso(DECISION_RECENT_DAYS)
    return decisions.filter((d) => {
      if (frForm.decision_ids.includes(d.decision_id_proposed)) return true
      if (!d.decision_date) return false
      return d.decision_date >= cutoff
    })
  }, [decisions, showAllDecisions, frForm.decision_ids])

  /**
   * Other fund requests linked to each decision (excludes the FR being edited).
   * Within an FR: split requested amount proportionally by decision amounts.
   * Across FRs: fill decision capacity in date/id order; capacity = decision × 105%
   * (5% margin for transfer fees). Anything above capacity is over-linked.
   */
  const fundingByDecision = useMemo(() => {
    const amountByDecision = new Map(
      decisions.map((d) => [d.decision_id_proposed, Number(d.decision_amount) || 0])
    )
    type FundingLink = {
      request_id: string
      requested_amount: number | null
      transfer_amount_rollup: number
      decision_count: number
      attributed: number
      accepted: number
      overLinked: number
      estimated: boolean
    }
    const map = new Map<string, FundingLink[]>()
    const remainingCapacity = new Map<string, number>()
    for (const [id, amount] of amountByDecision) {
      if (amount > 0) remainingCapacity.set(id, amount * FUNDING_CAPACITY_MARGIN)
    }

    const ordered = [...requests]
      .filter((fr) => !(editingFr && fr.id === editingFr.id))
      .sort((a, b) => {
        const da = a.date_submitted || ''
        const db = b.date_submitted || ''
        if (da !== db) return da.localeCompare(db)
        return a.request_id.localeCompare(b.request_id)
      })

    for (const fr of ordered) {
      const decisionIds = fr.decision_ids || []
      if (!decisionIds.length) continue
      const pool = Number(fr.requested_amount)
      const attributable = Number.isFinite(pool) ? pool : 0
      const decisionCount = decisionIds.length
      const weights = decisionIds.map((id) => amountByDecision.get(id) || 0)
      const weightSum = weights.reduce((s, w) => s + w, 0)
      const useProportional = weightSum > 0
      const estimated = decisionCount > 1

      decisionIds.forEach((decisionId, i) => {
        const attributed = useProportional
          ? attributable * (weights[i] / weightSum)
          : decisionCount > 0
            ? attributable / decisionCount
            : 0
        const room = remainingCapacity.get(decisionId)
        // No known decision amount → accept full share (nothing to cap against).
        const accepted =
          room == null ? attributed : Math.min(attributed, Math.max(0, room))
        const overLinked = Math.max(0, attributed - accepted)
        if (room != null) remainingCapacity.set(decisionId, room - accepted)

        const list = map.get(decisionId) || []
        list.push({
          request_id: fr.request_id,
          requested_amount: fr.requested_amount,
          transfer_amount_rollup: fr.transfer_amount_rollup,
          decision_count: decisionCount,
          attributed,
          accepted,
          overLinked,
          estimated,
        })
        map.set(decisionId, list)
      })
    }
    return map
  }, [requests, editingFr, decisions])

  const fundingLabel = (decisionId: string, decisionAmount: number | null) => {
    const links = fundingByDecision.get(decisionId)
    const denom = decisionAmount != null && decisionAmount > 0 ? decisionAmount : 0
    const capacity = denom > 0 ? denom * FUNDING_CAPACITY_MARGIN : 0
    if (!links?.length) {
      return {
        funded: 0,
        overLinked: 0,
        decisionAmount: denom,
        capacity,
        hasLinks: false,
        hasEstimate: false,
        text: '—',
        title: undefined as string | undefined,
      }
    }
    const funded = links.reduce((s, l) => s + l.accepted, 0)
    const overLinked = links.reduce((s, l) => s + l.overLinked, 0)
    const hasEstimate = links.some((l) => l.estimated)
    const detail = links
      .map((l) => {
        const splitNote =
          l.decision_count > 1
            ? ` ≈ ${money(l.attributed)} of ${money(l.requested_amount)} (proportional)`
            : ` ${money(l.attributed)}`
        const capNote =
          l.overLinked > 0
            ? ` → accepted ${money(l.accepted)}, over-linked ${money(l.overLinked)}`
            : l.accepted < l.attributed
              ? ` → accepted ${money(l.accepted)}`
              : ''
        return `${l.request_id}:${splitNote}${capNote}`
      })
      .join('; ')
    const pct = denom > 0 ? Math.round((funded / denom) * 100) : null
    const prefix = hasEstimate ? '≈' : ''
    const text =
      denom > 0
        ? `${prefix}${money(funded)} / ${money(denom)}${pct != null ? ` (${pct}%)` : ''}`
        : `${prefix}${money(funded)}`
    const title = [
      'Fills decision capacity in request-date order (capacity = decision × 105% for fees).',
      hasEstimate ? 'Multi-decision requests split in proportion to decision amounts.' : null,
      detail,
    ]
      .filter(Boolean)
      .join(' ')
    return {
      funded,
      overLinked,
      decisionAmount: denom,
      capacity,
      hasLinks: true,
      hasEstimate,
      text,
      title,
    }
  }

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
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                  <Label>Date of Request *</Label>
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
                      Pattern: YYYY-Partner-NNN
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
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Request Amount = Activity amount + transfer fees
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Label>Linked decisions</Label>
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showAllDecisions}
                        onChange={(e) => setShowAllDecisions(e.target.checked)}
                      />
                      Show all
                    </label>
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {showAllDecisions
                      ? 'Showing all decisions. A decision can be linked to more than one fund request.'
                      : `Showing decisions from the last ${DECISION_RECENT_DAYS} days (plus any already selected).`}{' '}
                    <span className="block mt-0.5">
                      Funding* shows how much other fund requests already cover this decision
                      (excluding the one you&apos;re editing). Amounts are applied oldest-first, with
                      5% extra room for fees; multi-decision requests are split by decision size.
                      * Reference only.
                    </span>
                  </p>
                  <div className="max-h-56 overflow-y-auto border rounded">
                    {selectableDecisions.length === 0 ? (
                      <div className="p-2 text-xs text-muted-foreground">
                        {decisions.length === 0
                          ? 'No decisions loaded'
                          : `No decisions in the last ${DECISION_RECENT_DAYS} days — turn on “Show all” to browse older ones.`}
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
                            <TableHead
                              className="min-w-[160px]"
                              title="Reference only — estimated coverage from other fund requests"
                            >
                              Funding*
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectableDecisions.map((d) => {
                            const checked = frForm.decision_ids.includes(d.decision_id_proposed)
                            const funding = fundingLabel(d.decision_id_proposed, d.decision_amount)
                            const barMax =
                              funding.capacity > 0
                                ? funding.capacity
                                : Math.max(funding.decisionAmount, funding.funded, 0)
                            const fillPct =
                              barMax > 0 ? Math.min(100, (funding.funded / barMax) * 100) : 0
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
                                <TableCell title={funding.title} className="min-w-[160px]">
                                  {!funding.hasLinks ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    <div className="space-y-0.5">
                                      <div className="h-2 w-full rounded-sm bg-muted overflow-hidden">
                                        <div
                                          className="h-full rounded-sm bg-primary"
                                          style={{ width: `${fillPct}%` }}
                                        />
                                      </div>
                                      <div className="text-[10px] leading-tight truncate text-muted-foreground">
                                        {funding.text}
                                      </div>
                                    </div>
                                  )}
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
          <div className="mb-3 space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              {t('err:allocation_guide_title')}
            </h3>
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
              <Badge
                variant="outline"
                className="h-5 border-amber-300 bg-amber-100 text-[10px] text-amber-900"
              >
                {t('err:allocation_guide_guidance_badge')}
              </Badge>
              <span>{t('err:allocation_guide_guidance_body')}</span>
            </div>
          </div>
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
                                <TableHead className="min-w-[120px]">Status</TableHead>
                                <TableHead>Received</TableHead>
                                <TableHead className="text-right">Activity</TableHead>
                                <TableHead className="text-right">Fee</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(fr.transfers || []).length === 0 &&
                                !(newTsRows[fr.id]?.length) && (
                                <TableRow>
                                  <TableCell colSpan={9} className="text-xs text-muted-foreground">
                                    No transfers yet
                                  </TableCell>
                                </TableRow>
                              )}
                              {(fr.transfers || []).map((t) => (
                                <TableRow key={t.id}>
                                  <TableCell>{t.transfer_id}</TableCell>
                                  <TableCell>{t.grant_id || '—'}</TableCell>
                                  <TableCell>{fspName(t.fsp_id)}</TableCell>
                                  <TableCell>
                                    <Select
                                      value={t.status || 'Requested'}
                                      onValueChange={(v) => updateTsStatus(t, v)}
                                    >
                                      <SelectTrigger
                                        size="sm"
                                        className={`!h-5 w-auto min-w-0 gap-0.5 rounded-full border px-2 py-0 text-[10px] font-medium leading-none shadow-none focus:ring-1 focus-visible:ring-1 data-[size=sm]:!h-5 [&>svg]:size-2.5 ${
                                          (t.status || 'Requested') === 'Received'
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-50'
                                            : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50'
                                        }`}
                                      >
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
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {t.transfer_received_date || '—'}
                                  </TableCell>
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
                              {(newTsRows[fr.id] || []).map((row, idx) => {
                                const fee = feeForNewRow(row)
                                const activity = row.activity_amount
                                  ? Number(row.activity_amount)
                                  : null
                                const total =
                                  activity != null && !Number.isNaN(activity)
                                    ? activity + (fee ?? 0)
                                    : fee
                                const draftRows = newTsRows[fr.id] || []
                                return (
                                  <TableRow key={`new-ts-${fr.id}-${idx}`} className="bg-muted/40">
                                    <TableCell className="text-muted-foreground text-[10px]">
                                      New
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={row.grant_id || undefined}
                                        onValueChange={(v) =>
                                          updateNewTsRow(fr.id, idx, { grant_id: v })
                                        }
                                      >
                                        <SelectTrigger className="h-7 text-xs w-[120px] min-w-0">
                                          <SelectValue placeholder="Grant" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {grants.map((g) => (
                                            <SelectItem key={g.id} value={g.grant_id}>
                                              {g.grant_id}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Select
                                        value={row.fsp_id || undefined}
                                        onValueChange={(v) =>
                                          updateNewTsRow(fr.id, idx, { fsp_id: v })
                                        }
                                      >
                                        <SelectTrigger className="h-7 text-xs w-[120px] min-w-0">
                                          <SelectValue placeholder="FSP" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {fsps.map((f) => (
                                            <SelectItem key={f.id} value={f.id}>
                                              {f.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">Requested</TableCell>
                                    <TableCell className="text-muted-foreground">—</TableCell>
                                    <TableCell className="text-right">
                                      <Input
                                        type="number"
                                        className="h-7 text-xs text-right w-[110px] ml-auto"
                                        value={row.activity_amount}
                                        onChange={(e) =>
                                          updateNewTsRow(fr.id, idx, {
                                            activity_amount: e.target.value,
                                          })
                                        }
                                      />
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                      {money(fee)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                      {money(total)}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex justify-end gap-1">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={() =>
                                            draftRows.length > 1
                                              ? setNewTsRows((prev) => ({
                                                  ...prev,
                                                  [fr.id]: draftRows.filter((_, i) => i !== idx),
                                                }))
                                              : setNewTsRows((prev) => {
                                                  const next = { ...prev }
                                                  delete next[fr.id]
                                                  return next
                                                })
                                          }
                                        >
                                          {draftRows.length > 1 ? 'Remove' : 'Cancel'}
                                        </Button>
                                        {idx === draftRows.length - 1 && (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() =>
                                              setNewTsRows((prev) => ({
                                                ...prev,
                                                [fr.id]: [...(prev[fr.id] || []), emptyNewTsRow()],
                                              }))
                                            }
                                          >
                                            Add row
                                          </Button>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })}
                            </TableBody>
                          </Table>
                          <div className="flex justify-end mt-2">
                            {(newTsRows[fr.id] || []).length === 0 ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => openCreateTs(fr.id)}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add transfer segment
                              </Button>
                            ) : (
                              validNewTsRows(newTsRows[fr.id] || []).length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={savingNewTs}
                                  onClick={() => saveNewTsRows(fr.id)}
                                >
                                  {savingNewTs ? 'Saving…' : 'Save transfer segments'}
                                </Button>
                              )
                            )}
                          </div>
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
                <TableHead className="text-right">Fee %</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Transfer in</TableHead>
                <TableHead className="text-right">Transfer out</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fsps.map((f) => {
                const inn = Number(f.treasury_in_usd) || 0
                const out = Number(f.treasury_out_usd) || 0
                const bal = f.balance != null ? Number(f.balance) : inn - out
                return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {f.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {f.transfer_fee_percent != null ? `${f.transfer_fee_percent}%` : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {f.contact_person || f.contact_email || '—'}
                  </TableCell>
                  <TableCell className="text-right">{money(inn)}</TableCell>
                  <TableCell className="text-right">{money(out)}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      bal < 0 ? 'text-red-700' : bal > 0 ? 'text-green-700' : ''
                    }`}
                  >
                    {money(bal)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditFsp(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteFsp(f.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
                )
              })}
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-xs text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : fsps.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-xs text-muted-foreground">
                    No FSPs yet. Run the seed script after applying the migration.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={tsOpen} onOpenChange={setTsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit transfer</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1 mb-1">
            Update grant, FSP, purpose, amounts, or comment. Status and received date are edited in
            the table.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
            <div className="min-w-0 space-y-1">
              <Label>Grant *</Label>
              <Select
                value={tsForm.grant_id || undefined}
                onValueChange={(v) => setTsForm({ ...tsForm, grant_id: v })}
              >
                <SelectTrigger className="w-full min-w-0">
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
            <div className="min-w-0 space-y-1">
              <Label>FSP *</Label>
              <Select
                value={tsForm.fsp_id || undefined}
                onValueChange={(v) => setTsForm({ ...tsForm, fsp_id: v })}
              >
                <SelectTrigger className="w-full min-w-0">
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
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <Label>Purpose</Label>
              <Select
                value={tsForm.purpose}
                onValueChange={(v) => setTsForm({ ...tsForm, purpose: v })}
              >
                <SelectTrigger className="w-full min-w-0">
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
            <div className="min-w-0 space-y-1">
              <Label>Activity amount</Label>
              <Input
                type="number"
                value={tsForm.activity_amount}
                onChange={(e) => setTsForm({ ...tsForm, activity_amount: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <Label>
                Transfer fee
                {selectedFsp?.transfer_fee_percent != null
                  ? ` (${selectedFsp.transfer_fee_percent}%)`
                  : ''}
              </Label>
              <Input
                type="text"
                readOnly
                value={calculatedTransferFee == null ? '—' : money(calculatedTransferFee)}
                className="bg-muted"
                title="Calculated from the selected FSP’s transfer fee %"
              />
            </div>
            <div className="min-w-0 space-y-1 sm:col-span-2">
              <Label>Comment</Label>
              <Input
                value={tsForm.comment}
                onChange={(e) => setTsForm({ ...tsForm, comment: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={saveTs} className="w-full">
                Save
              </Button>
            </div>
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
            <div>
              <Label>Transfer fee %</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fspForm.transfer_fee_percent}
                onChange={(e) =>
                  setFspForm({ ...fspForm, transfer_fee_percent: e.target.value })
                }
                placeholder="e.g. 2.5"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Applied to transfer activity amounts as fee = activity × %.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Transfer in is the sum of transfer segments for this FSP. Transfer out is
              payment confirmations on MOUs linked to this FSP (backfill pending).
            </p>
            <Button onClick={saveFsp} className="w-full">
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
