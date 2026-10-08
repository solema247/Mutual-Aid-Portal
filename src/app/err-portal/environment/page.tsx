'use client'

import { useCallback, useEffect, useState } from 'react'
import { notifyCanvasEnvironmentChanged, useCanvasSession } from '@/hooks/useCanvasSession'
import { CANVAS_ADMIN_ROLES } from '@/lib/canvas/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

type Mount = {
  code: string
  name: string
  description: string | null
  nav_group: string | null
  route_href: string | null
  sort_order: number
}

type Template = {
  code: string
  name: string
  description: string | null
  mount_codes: string[]
}

type WorkflowRequest = {
  id: string
  title: string
  body: string | null
  status: string
  created_at: string
}

export default function EnvironmentPage() {
  const { me, mountedModules, isLoading: meLoading } = useCanvasSession()
  const isAdmin = CANVAS_ADMIN_ROLES.has(me?.role ?? '')
  const [mounts, setMounts] = useState<Mount[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [requests, setRequests] = useState<WorkflowRequest[]>([])
  const [fallback, setFallback] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catRes, reqRes] = await Promise.all([
        fetch('/api/canvas/catalog'),
        fetch('/api/canvas/workflow-requests'),
      ])
      if (catRes.ok) {
        const cat = await catRes.json()
        setMounts(cat.mounts ?? [])
        setTemplates(cat.templates ?? [])
        setFallback(!!cat.canvas_is_fallback)
      }
      if (reqRes.ok) {
        const wr = await reqRes.json()
        setRequests(wr.requests ?? [])
      }
    } catch {
      setError('Failed to load environment catalog')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const mountedSet = new Set(mountedModules)

  async function enableMount(code: string) {
    setBusy(code)
    setError(null)
    try {
      const res = await fetch('/api/canvas/environment/mounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable', mount_code: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')
      notifyCanvasEnvironmentChanged()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enable mount')
    } finally {
      setBusy(null)
    }
  }

  async function disableMount(code: string) {
    setBusy(code)
    setError(null)
    try {
      const res = await fetch('/api/canvas/environment/mounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disable', mount_code: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')
      notifyCanvasEnvironmentChanged()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disable mount')
    } finally {
      setBusy(null)
    }
  }

  async function applyTemplate(code: string) {
    setBusy(code)
    setError(null)
    try {
      const res = await fetch('/api/canvas/environment/mounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply_template', template_code: code }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')
      notifyCanvasEnvironmentChanged()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply template')
    } finally {
      setBusy(null)
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault()
    setBusy('request')
    setError(null)
    try {
      const res = await fetch('/api/canvas/workflow-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed')
      setTitle('')
      setBody('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setBusy(null)
    }
  }

  const orgName = me?.organization_name ?? me?.environment_display_name ?? 'Your organization'

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{orgName}</h1>
        <p className="text-sm text-muted-foreground">
          Your environment is ready to configure. Mount a template or individual modules, or request a
          new workflow from the development team.
        </p>
        {fallback && (
          <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Canvas control-plane tables are not on this database yet (staging gap or SQL not applied).
            Catalog is read-only fallback. Apply <code className="text-xs">sql/canvas/</code> to
            production first.
          </p>
        )}
      </header>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}

      {(loading || meLoading) && <p className="text-sm text-muted-foreground">Loading…</p>}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Templates</h2>
        <ul className="space-y-3">
          {templates.map((t) => (
            <li key={t.code} className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">{t.name}</div>
                {t.description && (
                  <div className="text-sm text-muted-foreground">{t.description}</div>
                )}
                <div className="mt-1 text-xs text-muted-foreground">
                  {t.mount_codes?.length ?? 0} modules
                </div>
              </div>
              {isAdmin && (
                <Button
                  size="sm"
                  disabled={!!busy || fallback}
                  onClick={() => void applyTemplate(t.code)}
                >
                  {busy === t.code ? 'Applying…' : 'Mount template'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Modules</h2>
        <ul className="space-y-2">
          {mounts
            .filter((m) => m.code !== 'environment_home')
            .map((m) => {
              const on = mountedSet.has(m.code)
              return (
                <li
                  key={m.code}
                  className="flex flex-col gap-2 border-b py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">
                      {m.name}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        {on ? '· mounted' : '· available'}
                      </span>
                    </div>
                    {m.description && (
                      <div className="text-sm text-muted-foreground">{m.description}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <Button
                      size="sm"
                      variant={on ? 'outline' : 'default'}
                      disabled={!!busy || fallback}
                      onClick={() => void (on ? disableMount(m.code) : enableMount(m.code))}
                    >
                      {busy === m.code ? '…' : on ? 'Remove' : 'Mount'}
                    </Button>
                  )}
                </li>
              )
            })}
        </ul>
        {!isAdmin && (
          <p className="text-sm text-muted-foreground">
            Only admin, support, or superadmin can change mounts for this organization.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Request a new workflow</h2>
        <form onSubmit={submitRequest} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wf-title">Title</Label>
            <Input
              id="wf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={fallback}
              placeholder="e.g. Custom multi-step approval for Org B"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wf-body">How it differs from existing modules</Label>
            <Textarea
              id="wf-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={fallback}
              rows={4}
            />
          </div>
          <Button type="submit" disabled={!!busy || fallback || !title.trim()}>
            {busy === 'request' ? 'Submitting…' : 'Submit request'}
          </Button>
        </form>

        {requests.length > 0 && (
          <ul className="mt-4 space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="text-sm">
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground"> — {r.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
