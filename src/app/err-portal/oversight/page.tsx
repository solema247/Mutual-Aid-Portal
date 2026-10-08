'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { Minus, Plus, RefreshCw } from 'lucide-react'
import { useCanvasSession } from '@/hooks/useCanvasSession'
import { isModuleMounted } from '@/lib/canvas/mounts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type TypeRow = {
  resource_type: string
  label: string
  visibility: 'disclosed' | 'withheld'
  states_granted: string[] | null
  pending_request_id: string | null
  count: number | null
}

type ProcessorRow = {
  organization_id: string
  organization_name: string
  organization_slug: string
  types: TypeRow[]
}

const COMMON_STATES = [
  'Khartoum',
  'Red Sea',
  'Blue Nile',
  'White Nile',
  'Kassala',
  'Gedaref',
  'North Darfur',
  'South Darfur',
  'East Darfur',
  'West Darfur',
  'Central Darfur',
  'North Kordofan',
  'South Kordofan',
  'West Kordofan',
  'Northern',
  'River Nile',
  'Sennar',
  'Al Jazirah',
]

export default function OversightPage() {
  const { me, mountedModules, isLoading: meLoading } = useCanvasSession()
  const mounted = isModuleMounted(mountedModules, 'oversight')
  const isCoordinator = me?.organization_type === 'coordinator'
  const [processors, setProcessors] = useState<ProcessorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set())

  // Request dialog state
  const [dialog, setDialog] = useState<{
    orgId: string
    orgName: string
    resourceType: string
    label: string
  } | null>(null)
  const [allStates, setAllStates] = useState(true)
  const [selectedStates, setSelectedStates] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [customState, setCustomState] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/canvas/oversight/catalog')
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setError(data.error || 'Coordinator access required')
        setProcessors([])
        return
      }
      if (!res.ok) {
        setError(data.error || 'Failed to load oversight catalog')
        setProcessors([])
        return
      }
      setProcessors(data.processors ?? [])
      setUnavailable(!!data.disclosure_unavailable || !!data.canvas_is_fallback)
    } catch {
      setError('Failed to load oversight catalog')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (meLoading) return
    if (!mounted || !isCoordinator) {
      setLoading(false)
      return
    }
    void reload()
  }, [meLoading, mounted, isCoordinator, reload])

  function toggleOrg(orgId: string) {
    setExpandedOrgs((prev) => {
      const next = new Set(prev)
      if (next.has(orgId)) next.delete(orgId)
      else next.add(orgId)
      return next
    })
  }

  function openRequest(org: ProcessorRow, t: TypeRow) {
    setDialog({
      orgId: org.organization_id,
      orgName: org.organization_name,
      resourceType: t.resource_type,
      label: t.label,
    })
    setAllStates(true)
    setSelectedStates([])
    setReason('')
    setCustomState('')
  }

  function toggleState(name: string) {
    setSelectedStates((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]
    )
  }

  async function submitRequest() {
    if (!dialog) return
    const key = `${dialog.orgId}:${dialog.resourceType}`
    setBusyKey(key)
    setError(null)
    try {
      const res = await fetch('/api/canvas/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_organization_id: dialog.orgId,
          resource_type: dialog.resourceType,
          states: allStates ? null : selectedStates,
          reason: reason.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setDialog(null)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusyKey(null)
    }
  }

  if (meLoading) {
    return <div className="py-12 text-center text-muted-foreground">Loading…</div>
  }

  if (!mounted || !isCoordinator) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Oversight</h1>
        <p className="text-sm text-muted-foreground">
          This view is available only for coordinator organizations with the Oversight module
          mounted.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Oversight</h1>
      </div>

      {unavailable && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Disclosure tables may be incomplete. Apply{' '}
          <code className="text-xs">sql/canvas/005_info_type_disclosure.sql</code> on production.
        </p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle>Processor organizations</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-muted-foreground">
            Expand an organization to request access by information type. After approval,{' '}
            <span className="font-medium text-foreground">Granted states</span> shows whether you
            can see all Sudan states or only selected ones.
            <span className="ml-2 font-medium text-foreground">→ Click + to expand</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : processors.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No processor organizations to show yet.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className="w-full text-[11px] [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-0.5 [&_th]:leading-tight">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Organization / information type</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Granted states</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Records</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processors.map((org) => {
                    const isOpen = expandedOrgs.has(org.organization_id)
                    const withheldCount = org.types.filter((t) => t.visibility === 'withheld').length
                    const disclosedCount = org.types.filter(
                      (t) => t.visibility === 'disclosed'
                    ).length
                    return (
                      <Fragment key={org.organization_id}>
                        <TableRow
                          className="cursor-pointer bg-muted/50 font-semibold transition-colors hover:bg-muted/50"
                          onClick={() => toggleOrg(org.organization_id)}
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              {isOpen ? (
                                <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              {org.organization_name}
                            </span>
                          </TableCell>
                          <TableCell className="font-normal">
                            <span className="text-amber-800">{withheldCount} withheld</span>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-emerald-800">{disclosedCount} disclosed</span>
                          </TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell />
                        </TableRow>

                        {isOpen &&
                          org.types.map((t) => {
                            const withheld = t.visibility === 'withheld'
                            return (
                              <TableRow
                                key={`${org.organization_id}:${t.resource_type}`}
                                className="transition-colors hover:bg-muted/50"
                              >
                                <TableCell className="pl-6 font-normal">{t.label}</TableCell>
                                <TableCell>
                                  <span
                                    className={
                                      withheld ? 'text-amber-800' : 'text-emerald-800'
                                    }
                                  >
                                    {withheld ? 'Withheld' : 'Disclosed'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {withheld
                                    ? 'None yet'
                                    : t.states_granted == null
                                      ? 'All states'
                                      : t.states_granted.join(', ')}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {t.count != null ? t.count : '—'}
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {withheld && !t.pending_request_id && (
                                    <Button
                                      size="sm"
                                      className="h-6 shrink-0 px-1.5 py-0.5 text-xs"
                                      disabled={!!busyKey}
                                      onClick={() => openRequest(org, t)}
                                    >
                                      Request access
                                    </Button>
                                  )}
                                  {withheld && t.pending_request_id && (
                                    <span className="text-muted-foreground">Pending</span>
                                  )}
                                  {!withheld && (
                                    <span className="text-muted-foreground">Granted</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-lg border bg-background p-5 shadow-lg">
            <h3 className="text-lg font-semibold">Request access</h3>
            <p className="text-sm text-muted-foreground">
              {dialog.label} from <span className="font-medium">{dialog.orgName}</span>
            </p>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={allStates}
                  onChange={() => setAllStates(true)}
                />
                All states
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={!allStates}
                  onChange={() => setAllStates(false)}
                />
                Specific states
              </label>
            </div>

            {!allStates && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                {COMMON_STATES.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedStates.includes(s)}
                      onChange={() => toggleState(s)}
                    />
                    {s}
                  </label>
                ))}
                <div className="flex gap-2 pt-2">
                  <Input
                    placeholder="Other state name"
                    value={customState}
                    onChange={(e) => setCustomState(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const v = customState.trim()
                      if (v && !selectedStates.includes(v)) {
                        setSelectedStates((prev) => [...prev, v])
                      }
                      setCustomState('')
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="req-reason" className="text-xs">
                Reason (optional)
              </Label>
              <Textarea
                id="req-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!!busyKey || (!allStates && selectedStates.length === 0)}
                onClick={() => void submitRequest()}
              >
                {busyKey ? 'Submitting…' : 'Submit request'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
