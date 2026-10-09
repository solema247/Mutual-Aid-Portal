'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCanvasSession } from '@/hooks/useCanvasSession'
import { isModuleMounted } from '@/lib/canvas/mounts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

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
}

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

  if (meLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  if (!isProcessor && !isCoordinator) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Access requests</h1>
        <p className="text-sm text-muted-foreground">
          Access requests are available for host and coordinator organizations.
        </p>
      </div>
    )
  }

  const pending = rows.filter((r) => r.status === 'pending')
  const decided = rows.filter((r) => r.status !== 'pending')

  function describe(r: AccessRequestRow) {
    const typeLabel = r.resource_type_label || r.resource_type
    const states = r.states_label || (r.states?.length ? r.states.join(', ') : 'all states')
    return `${typeLabel} — ${states}`
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isProcessor ? 'Access request inbox' : 'My access requests'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isProcessor
            ? 'Approve or deny requests for information types (e.g. all F1s, or F1s in selected states).'
            : 'Track type-level access requests you have submitted to host organizations.'}
        </p>
        {unavailable && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Disclosure tables are not available yet. Apply canvas SQL on production.
          </p>
        )}
      </header>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Pending ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <ul className="space-y-4">
                {pending.map((r) => (
                  <li key={r.id} className="space-y-2 border-b pb-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-medium">
                        {isProcessor
                          ? `From ${r.requesting_org_name ?? 'coordinator'}`
                          : `To ${r.target_org_name ?? 'host organization'}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-sm">{describe(r)}</div>
                    {r.reason && <p className="text-sm text-muted-foreground">Reason: {r.reason}</p>}
                    {r.can_decide && (
                      <div className="space-y-2 pt-1">
                        <div className="space-y-1">
                          <Label htmlFor={`note-${r.id}`} className="text-xs">
                            Decision note (required to deny)
                          </Label>
                          <Textarea
                            id={`note-${r.id}`}
                            rows={2}
                            value={noteById[r.id] ?? ''}
                            onChange={(e) =>
                              setNoteById((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder="Explain why you are denying (or approving)"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!!busyId}
                            onClick={() => void decide(r.id, 'approved')}
                          >
                            {busyId === r.id ? '…' : 'Approve'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busyId || !(noteById[r.id]?.trim())}
                            onClick={() => void decide(r.id, 'denied')}
                          >
                            Deny
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {decided.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-medium">History</h2>
              <ul className="space-y-2">
                {decided.map((r) => (
                  <li key={r.id} className="text-sm border-b pb-2">
                    <span className="font-medium capitalize">{r.status}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      —{' '}
                      {isProcessor
                        ? r.requesting_org_name ?? 'coordinator'
                        : r.target_org_name ?? 'host organization'}
                      {' · '}
                      {describe(r)}
                      {r.decided_at && <> · {new Date(r.decided_at).toLocaleString()}</>}
                    </span>
                    {r.decision_note && (
                      <div className="text-xs text-muted-foreground mt-1">{r.decision_note}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
