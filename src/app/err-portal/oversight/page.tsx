'use client'

import { useCallback, useEffect, useState } from 'react'
import { useCanvasSession } from '@/hooks/useCanvasSession'
import { isModuleMounted } from '@/lib/canvas/mounts'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type OversightRow = {
  visibility: 'disclosed' | 'withheld'
  pending_request_id: string | null
  has_access_grant: boolean
  project: {
    id: string
    organization_id: string
    owning_org_name: string
    state: string | null
    locality: string | null
    err_code: string | null
    funding_status: string | null
    status: string
    date: string | null
    project_name?: string | null
    grant_serial?: string | null
    workplan_number?: number | null
    project_objectives?: string | null
    estimated_beneficiaries?: number | null
    'Sector (Primary)'?: string | null
  }
}

export default function OversightPage() {
  const { me, mountedModules, isLoading: meLoading } = useCanvasSession()
  const mounted = isModuleMounted(mountedModules, 'oversight')
  const isCoordinator = me?.organization_type === 'coordinator'
  const [rows, setRows] = useState<OversightRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [reasonById, setReasonById] = useState<Record<string, string>>({})

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/canvas/oversight/projects')
      const data = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setError(data.error || 'Coordinator access required')
        setRows([])
        return
      }
      if (!res.ok) {
        setError(data.error || 'Failed to load oversight projects')
        setRows([])
        return
      }
      setRows(data.projects ?? [])
      setUnavailable(!!data.disclosure_unavailable || !!data.canvas_is_fallback)
    } catch {
      setError('Failed to load oversight projects')
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

  async function requestAccess(row: OversightRow) {
    setBusyId(row.project.id)
    setError(null)
    try {
      const res = await fetch('/api/canvas/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_type: 'err_project',
          resource_id: row.project.id,
          target_organization_id: row.project.organization_id,
          scope: 'record',
          reason: reasonById[row.project.id]?.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Request failed')
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setBusyId(null)
    }
  }

  if (meLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  if (!mounted || !isCoordinator) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Oversight</h1>
        <p className="text-sm text-muted-foreground">
          This view is available only for coordinator organizations with the Oversight module
          mounted.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Oversight</h1>
        <p className="text-sm text-muted-foreground">
          Processor projects advertised to your organization. Disclosed rows show content; withheld
          rows show existence only — request access from the owning processor.
        </p>
        {unavailable && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Disclosure tables are not available on this database yet. Apply{' '}
            <code className="text-xs">sql/canvas/004_disclosure_access_requests.sql</code> on
            production.
          </p>
        )}
      </header>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && rows.length === 0 && !unavailable && (
        <p className="text-sm text-muted-foreground">No advertised processor projects yet.</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Visibility</th>
              <th className="py-2 pr-3 font-medium">Owning org</th>
              <th className="py-2 pr-3 font-medium">Project</th>
              <th className="py-2 pr-3 font-medium">State / locality</th>
              <th className="py-2 pr-3 font-medium">Room</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const p = row.project
              const withheld = row.visibility === 'withheld'
              return (
                <tr key={p.id} className="border-b align-top">
                  <td className="py-3 pr-3">
                    <span
                      className={
                        withheld
                          ? 'text-amber-800'
                          : 'text-emerald-800'
                      }
                    >
                      {withheld ? 'Withheld' : 'Disclosed'}
                    </span>
                  </td>
                  <td className="py-3 pr-3">{p.owning_org_name}</td>
                  <td className="py-3 pr-3">
                    {withheld ? (
                      <span className="text-muted-foreground">Content locked</span>
                    ) : (
                      <div className="space-y-1">
                        <div className="font-medium">{p.project_name || 'Untitled project'}</div>
                        {p.grant_serial && (
                          <div className="text-xs text-muted-foreground">{p.grant_serial}</div>
                        )}
                        {p.project_objectives && (
                          <div className="max-w-xs text-xs text-muted-foreground line-clamp-2">
                            {p.project_objectives}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{p.id.slice(0, 8)}…</div>
                  </td>
                  <td className="py-3 pr-3">
                    {[p.state, p.locality].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="py-3 pr-3">{p.err_code || '—'}</td>
                  <td className="py-3 pr-3">
                    <div>{p.funding_status || '—'}</div>
                    <div className="text-xs text-muted-foreground">{p.status}</div>
                  </td>
                  <td className="py-3 pr-3">{p.date || '—'}</td>
                  <td className="py-3">
                    {withheld && !row.pending_request_id && (
                      <div className="space-y-2 min-w-[160px]">
                        <div className="space-y-1">
                          <Label htmlFor={`reason-${p.id}`} className="text-xs">
                            Reason (optional)
                          </Label>
                          <Textarea
                            id={`reason-${p.id}`}
                            rows={2}
                            className="text-xs"
                            value={reasonById[p.id] ?? ''}
                            onChange={(e) =>
                              setReasonById((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={!!busyId}
                          onClick={() => void requestAccess(row)}
                        >
                          {busyId === p.id ? 'Requesting…' : 'Request access'}
                        </Button>
                      </div>
                    )}
                    {withheld && row.pending_request_id && (
                      <span className="text-xs text-muted-foreground">Request pending</span>
                    )}
                    {!withheld && (
                      <span className="text-xs text-muted-foreground">Visible</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
