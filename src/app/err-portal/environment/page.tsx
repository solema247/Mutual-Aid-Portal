'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Minus, Plus, RefreshCw } from 'lucide-react'
import { notifyCanvasEnvironmentChanged, useCanvasSession } from '@/hooks/useCanvasSession'
import { CANVAS_ADMIN_ROLES } from '@/lib/canvas/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** Sidebar group order + labels (aligned with err-portal layout). */
const NAV_GROUP_ORDER = [
  'grant_management',
  'f_system',
  'reporting',
  'admin',
] as const

const NAV_GROUP_LABELS: Record<string, string> = {
  grant_management: 'Grant management',
  f_system: 'F-System',
  reporting: 'Reporting & learnings',
  admin: 'Admin',
  system: 'Admin',
  other: 'Other',
}

/** Map catalog nav_group into sidebar categories (access_inbox is system → Admin). */
function sidebarCategory(navGroup: string | null): string {
  const g = (navGroup || 'other').toLowerCase()
  if (g === 'system') return 'admin'
  if ((NAV_GROUP_ORDER as readonly string[]).includes(g)) return g
  return 'other'
}

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

const tableClass =
  'w-full text-[11px] [&_th]:px-1 [&_td]:px-1 [&_th]:py-1 [&_td]:py-0.5 [&_th]:leading-tight'

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set([...NAV_GROUP_ORDER, 'other'])
  )

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

  const moduleGroups = useMemo(() => {
    const byCat = new Map<string, Mount[]>()
    for (const m of mounts) {
      if (m.code === 'environment_home') continue
      const cat = sidebarCategory(m.nav_group)
      const list = byCat.get(cat) ?? []
      list.push(m)
      byCat.set(cat, list)
    }
    for (const list of byCat.values()) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    const ordered: { key: string; label: string; modules: Mount[] }[] = []
    for (const key of NAV_GROUP_ORDER) {
      const modules = byCat.get(key)
      if (modules?.length) {
        ordered.push({ key, label: NAV_GROUP_LABELS[key] ?? key, modules })
      }
    }
    const other = byCat.get('other')
    if (other?.length) {
      ordered.push({ key: 'other', label: NAV_GROUP_LABELS.other, modules: other })
    }
    return ordered
  }, [mounts])

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
  const showLoading = loading || meLoading

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{orgName}</h1>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={showLoading}>
          <RefreshCw className={cn('mr-2 h-4 w-4', showLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

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

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Only admin, support, or superadmin can change mounts for this organization.
        </p>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Templates</CardTitle>
        </CardHeader>
        <CardContent>
          {showLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No templates available.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className={tableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Template</TableHead>
                    <TableHead className="whitespace-nowrap">Description</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Modules</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow
                      key={t.code}
                      className="transition-colors hover:bg-muted/50"
                    >
                      <TableCell className="font-medium whitespace-nowrap">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.description || '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.mount_codes?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        {isAdmin ? (
                          <Button
                            size="sm"
                            className="h-6 shrink-0 px-1.5 py-0.5 text-xs"
                            disabled={!!busy || fallback}
                            onClick={() => void applyTemplate(t.code)}
                          >
                            {busy === t.code ? 'Applying…' : 'Mount template'}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
          <CardTitle>Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-muted-foreground">
            Grouped like the sidebar. Mounted modules appear in navigation for this organization.
            <span className="ml-2 font-medium text-foreground">→ Click + / − to expand</span>
          </div>
          {showLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : moduleGroups.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No modules in catalog.</div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table className={tableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Category / module</TableHead>
                    <TableHead className="whitespace-nowrap">Description</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {moduleGroups.map((group) => {
                    const isOpen = expandedGroups.has(group.key)
                    const mountedCount = group.modules.filter((m) =>
                      mountedSet.has(m.code)
                    ).length
                    return (
                      <Fragment key={group.key}>
                        <TableRow
                          className="cursor-pointer bg-muted/50 font-semibold transition-colors hover:bg-muted/50"
                          onClick={() => toggleGroup(group.key)}
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-1">
                              {isOpen ? (
                                <Minus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              )}
                              {group.label}
                            </span>
                          </TableCell>
                          <TableCell className="font-normal text-muted-foreground">
                            {group.modules.length} modules
                          </TableCell>
                          <TableCell className="font-normal">
                            <span className="text-emerald-800">{mountedCount} mounted</span>
                            <span className="mx-1 text-muted-foreground">·</span>
                            <span className="text-muted-foreground">
                              {group.modules.length - mountedCount} available
                            </span>
                          </TableCell>
                          <TableCell />
                        </TableRow>

                        {isOpen &&
                          group.modules.map((m) => {
                            const on = mountedSet.has(m.code)
                            return (
                              <TableRow
                                key={m.code}
                                className="transition-colors hover:bg-muted/50"
                              >
                                <TableCell className="pl-6 font-normal whitespace-nowrap">
                                  {m.name}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {m.description || '—'}
                                </TableCell>
                                <TableCell>
                                  <span
                                    className={
                                      on ? 'text-emerald-800' : 'text-muted-foreground'
                                    }
                                  >
                                    {on ? 'Mounted' : 'Available'}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right">
                                  {isAdmin ? (
                                    <Button
                                      size="sm"
                                      variant={on ? 'outline' : 'default'}
                                      className="h-6 shrink-0 px-1.5 py-0.5 text-xs"
                                      disabled={!!busy || fallback}
                                      onClick={() =>
                                        void (on ? disableMount(m.code) : enableMount(m.code))
                                      }
                                    >
                                      {busy === m.code ? '…' : on ? 'Remove' : 'Mount'}
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
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

      <Card>
        <CardHeader className="pb-4">
          <CardTitle>Request a new workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitRequest} className="max-w-xl space-y-3">
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
            <div className="w-full overflow-x-auto">
              <Table className={tableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Request</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                    <TableHead className="whitespace-nowrap">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((r) => (
                    <TableRow key={r.id} className="transition-colors hover:bg-muted/50">
                      <TableCell className="font-medium">{r.title}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{r.status}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
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
