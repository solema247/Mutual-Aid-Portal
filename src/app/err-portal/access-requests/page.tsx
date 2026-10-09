'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useCanvasSession } from '@/hooks/useCanvasSession'
import { isModuleMounted } from '@/lib/canvas/mounts'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type AccessRequestRow = {
  id: string
  requesting_organization_id: string
  target_organization_id: string
  requesting_org_name: string | null
  target_org_name: string | null
  resource_type: string
  resource_type_label?: string
  resource_id: string | null
  scope: string
  states: string[] | null
  states_label?: string
  reason: string | null
  status: string
  decided_at: string | null
  decision_note: string | null
  created_at: string
  can_decide: boolean
  can_revoke?: boolean
  grant_active?: boolean
}

const tableClass =
  'w-full text-[11px] [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-0.5 [&_th]:leading-tight'

export default function AccessRequestsPage() {
  const { me, mountedModules, isLoading: meLoading } = useCanvasSession()
  const mounted =
    isModuleMounted(mountedModules, 'access_inbox') ||
    me?.organization_type === 'coordinator'
  const isProcessor = me?.organization_type === 'processor'
  const isCoordinator = me?.organization_type === 'coordinator'
  const [rows, setRows] = useState<AccessRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [noteById, setNoteById] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/canvas/access-requests')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Failed to load access requests')
        setRows([])
        return
      }
      setRows(data.requests ?? [])
      setUnavailable(!!data.disclosure_unavailable || !!data.canvas_is_fallback)
    } catch {
      setError('Failed to load access requests')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (meLoading) return
    if (!mounted && !isCoordinator && !isProcessor) {
      setLoading(false)
      return
    }
    void reload()
  }, [meLoading, mounted, isCoordinator, isProcessor, reload])

  async function decide(id: string, decision: 'approved' | 'denied') {
    const note = noteById[id]?.trim() || ''
    if (decision === 'denied' && !note) {
      setError('A reason is required when denying an access request')
      return
    }

    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/canvas/access-requests/${id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          decision_note: note || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Decision failed')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed')
    } finally {
      setBusyId(null)
    }
  }

  async function revoke(id: string) {
    const note = noteById[id]?.trim() || ''
    if (!note) {
      setError('A reason is required when revoking access')
      return
    }

    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/canvas/access-requests/${id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision_note: note,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Revoke failed')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setBusyId(null)
    }
  }

  function statusLabel(r: AccessRequestRow) {
    if (r.status === 'approved' && r.grant_active === false) return 'Revoked'
    return r.status.charAt(0).toUpperCase() + r.status.slice(1)
  }

  function orgLabel(r: AccessRequestRow) {
    return isProcessor
      ? r.requesting_org_name ?? 'Coordinator'
      : r.target_org_name ?? 'Host organization'
  }

  function typeLabel(r: AccessRequestRow) {
    return r.resource_type_label || r.resource_type
  }

  function statesLabel(r: AccessRequestRow) {
    return r.states_label || (r.states?.length ? r.states.join(', ') : 'All states')
  }

  function formatWhen(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString()
  }

  if (meLoading) {
    return <div className="py-8 text-center text-muted-foreground">Loading…</div>
  }

  if (!isProcessor && !isCoordinator) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Access requests</h1>
        <p className="text-sm text-muted-foreground">
          Access requests are available for host and coordinator organizations.
        </p>
      </div>
    )
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const decided = rows.filter((r) => r.status !== 'pending')
  const orgCol = isProcessor ? 'From' : 'To'
  const showLoading = loading || meLoading
  const pageTitle = isProcessor ? 'Access request inbox' : 'My access requests'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={showLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', showLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {isProcessor
          ? 'Approve or deny requests for information types (e.g. all F1s, or F1s in selected states).'
          : 'Track type-level access requests you have submitted to host organizations.'}
      </p>

      {unavailable && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Disclosure tables are not available yet. Apply{' '}
          <code className="text-xs">sql/canvas/</code> to enable access requests.
        </p>
      )}

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Pending ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No pending requests.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className={tableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{orgCol}</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">States</TableHead>
                    <TableHead className="whitespace-nowrap">Reason</TableHead>
                    <TableHead className="whitespace-nowrap">Requested</TableHead>
                    {isProcessor ? (
                      <>
                        <TableHead className="whitespace-nowrap">Note</TableHead>
                        <TableHead className="text-right whitespace-nowrap">Action</TableHead>
                      </>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((r) => (
                    <TableRow key={r.id} className="transition-colors hover:bg-muted/50">
                      <TableCell className="font-medium whitespace-nowrap">{orgLabel(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{typeLabel(r)}</TableCell>
                      <TableCell className="text-muted-foreground">{statesLabel(r)}</TableCell>
                      <TableCell
                        className="max-w-[160px] truncate text-muted-foreground"
                        title={r.reason ?? undefined}
                      >
                        {r.reason || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatWhen(r.created_at)}
                      </TableCell>
                      {isProcessor ? (
                        <>
                          <TableCell>
                            {r.can_decide ? (
                              <Input
                                id={`note-${r.id}`}
                                value={noteById[r.id] ?? ''}
                                onChange={(e) =>
                                  setNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                placeholder="Required to deny"
                                className="h-6 min-w-[140px] text-xs"
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.can_decide ? (
                              <div className="inline-flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  className="h-6 shrink-0 px-1.5 py-0.5 text-xs"
                                  disabled={!!busyId}
                                  onClick={() => void decide(r.id, 'approved')}
                                >
                                  {busyId === r.id ? '…' : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 shrink-0 px-1.5 py-0.5 text-xs"
                                  disabled={!!busyId || !(noteById[r.id]?.trim())}
                                  onClick={() => void decide(r.id, 'denied')}
                                >
                                  Deny
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>History ({decided.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : decided.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No decided requests yet.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className={tableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">{orgCol}</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead className="whitespace-nowrap">States</TableHead>
                    <TableHead className="whitespace-nowrap">Note</TableHead>
                    <TableHead className="whitespace-nowrap">Decided</TableHead>
                    {isProcessor ? (
                      <TableHead className="text-right whitespace-nowrap">Action</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {decided.map((r) => (
                    <TableRow key={r.id} className="transition-colors hover:bg-muted/50">
                      <TableCell
                        className={cn(
                          'font-medium whitespace-nowrap',
                          statusLabel(r) === 'Approved' && 'text-emerald-800',
                          statusLabel(r) === 'Denied' && 'text-muted-foreground',
                          statusLabel(r) === 'Revoked' && 'text-amber-800',
                        )}
                      >
                        {statusLabel(r)}
                      </TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{orgLabel(r)}</TableCell>
                      <TableCell className="whitespace-nowrap">{typeLabel(r)}</TableCell>
                      <TableCell className="text-muted-foreground">{statesLabel(r)}</TableCell>
                      <TableCell className="max-w-[180px]">
                        {r.can_revoke ? (
                          <Input
                            id={`revoke-note-${r.id}`}
                            value={noteById[r.id] ?? ''}
                            onChange={(e) =>
                              setNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder="Required to revoke"
                            className="h-6 min-w-[140px] text-xs"
                          />
                        ) : (
                          <span
                            className="truncate text-muted-foreground"
                            title={r.decision_note ?? undefined}
                          >
                            {r.decision_note || '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatWhen(r.decided_at)}
                      </TableCell>
                      {isProcessor ? (
                        <TableCell className="text-right">
                          {r.can_revoke ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 shrink-0 px-1.5 py-0.5 text-xs"
                              disabled={!!busyId || !(noteById[r.id]?.trim())}
                              onClick={() => void revoke(r.id)}
                            >
                              {busyId === r.id ? '…' : 'Revoke'}
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
