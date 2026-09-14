'use client'

import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChevronDown, GripVertical } from 'lucide-react'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import type { FunctionDefinition } from '@/lib/permissions'

const MODULE_LABELS: Record<string, string> = {
  f1: 'F1 Work Plans',
  f2: 'F2 Approvals',
  f3: 'F3 MOUs',
  f4_f5: 'F4 & F5 Reporting',
  management: 'Project Management',
  users: 'User Management',
  grants: 'Grant Management',
  rooms: 'Room Management',
  states: 'State Management',
  compliance: 'Compliance',
  archive: 'Data Archive',
  dashboard: 'Dashboard',
  learnings: 'Mutual Aid Learnings',
  surveys: 'Surveys',
  tickets: 'Tickets',
}

const MODULE_ORDER = [
  'grants',
  'f1',
  'f2',
  'f3',
  'f4_f5',
  'management',
  'archive',
  'users',
  'rooms',
  'states',
  'compliance',
  'dashboard',
  'learnings',
  'surveys',
  'tickets',
] as const

const ROLE_TABS: { id: string; label: string }[] = [
  { id: 'base_err', label: 'Base ERR' },
  { id: 'state_err', label: 'State ERR' },
  { id: 'admin', label: 'Admin' },
  { id: 'superadmin', label: 'Superadmin' },
  { id: 'support', label: 'Support' },
]

const FULL_ACCESS = new Set(['superadmin', 'support'])
const HIDDEN_CODES = new Set(['f1_assign_grant'])

type OverviewUser = {
  id: string
  display_name: string | null
  role: string
  err_name: string | null
  state_name: string | null
  overrides: { add: string[]; remove: string[] }
  hasExceptions: boolean
  roleBase: string[]
}

type OverviewPayload = {
  users: OverviewUser[]
  roleCounts: Record<string, number>
  roleDefaults: Record<string, string[]>
  editableRoles: string[]
  visibleRoles: string[]
  viewerRole: string
  functionsByModule: Record<string, FunctionDefinition[]>
}

function moduleKeys(functionsByModule: Record<string, FunctionDefinition[]>): string[] {
  const known = MODULE_ORDER.filter(
    (k) => k === 'f4_f5' || (functionsByModule[k] && functionsByModule[k].length > 0)
  )
  const extras = Object.keys(functionsByModule).filter(
    (k) => !(MODULE_ORDER as readonly string[]).includes(k) && k !== 'f4' && k !== 'f5'
  )
  return [...known, ...extras]
}

function funcsForModule(
  moduleKey: string,
  functionsByModule: Record<string, FunctionDefinition[]>
): FunctionDefinition[] {
  const raw =
    moduleKey === 'f4_f5'
      ? [...(functionsByModule.f4 || []), ...(functionsByModule.f5 || [])]
      : functionsByModule[moduleKey] || []
  return raw.filter((f) => !HIDDEN_CODES.has(f.code))
}

function computeEffective(
  roleBase: string[],
  add: string[],
  remove: string[],
  isFullAccess: boolean,
  allCodes: string[]
): Set<string> {
  if (isFullAccess) return new Set(allCodes)
  const set = new Set(roleBase)
  remove.forEach((c) => set.delete(c))
  add.forEach((c) => set.add(c))
  return set
}

export default function RolePermissionsManager() {
  const searchParams = useSearchParams()
  const { can } = useAllowedFunctions()
  const canManage = can('users_manage_permissions')

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<OverviewPayload | null>(null)
  const [roleTab, setRoleTab] = useState('base_err')
  const [search, setSearch] = useState('')
  const [activeUserId, setActiveUserId] = useState<string | null>(null)

  const [draftDefaults, setDraftDefaults] = useState<Set<string>>(new Set())
  const [defaultsDirty, setDefaultsDirty] = useState(false)
  const [savingDefaults, setSavingDefaults] = useState(false)

  const [draftAdd, setDraftAdd] = useState<string[]>([])
  const [draftRemove, setDraftRemove] = useState<string[]>([])
  const [exceptionsDirty, setExceptionsDirty] = useState(false)
  const [savingExceptions, setSavingExceptions] = useState(false)
  const [leaveDefaultConfirmed, setLeaveDefaultConfirmed] = useState(false)

  const [dragOverDefault, setDragOverDefault] = useState(false)
  const [confirmMoveToDefault, setConfirmMoveToDefault] = useState<OverviewUser | null>(null)
  const [confirmLeaveDefault, setConfirmLeaveDefault] = useState<{
    codes: string[]
    wantOn: boolean
  } | null>(null)
  const [movingToDefault, setMovingToDefault] = useState(false)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openModules, setOpenModules] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/permissions/overview')
      if (!res.ok) throw new Error('Failed to load permissions overview')
      const payload = (await res.json()) as OverviewPayload
      setData(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!data) return
    const fromUrl = searchParams.get('userId')
    if (fromUrl && data.users.some((u) => u.id === fromUrl)) {
      const u = data.users.find((x) => x.id === fromUrl)!
      setRoleTab(u.role)
      setActiveUserId(u.id)
    }
  }, [data, searchParams])

  const visibleRoleTabs = useMemo(() => {
    const allowed = new Set(data?.visibleRoles ?? ['base_err', 'state_err'])
    return ROLE_TABS.filter((t) => allowed.has(t.id))
  }, [data])

  useEffect(() => {
    if (!data) return
    if (!data.visibleRoles.includes(roleTab)) {
      setRoleTab(data.visibleRoles[0] ?? 'base_err')
    }
  }, [data, roleTab])

  useEffect(() => {
    if (!data) return
    const defaults = data.roleDefaults[roleTab] ?? []
    setDraftDefaults(new Set(defaults))
    setDefaultsDirty(false)
    setActiveUserId((prev) => {
      if (!prev) return null
      const u = data.users.find((x) => x.id === prev)
      return u && u.role === roleTab ? prev : null
    })
    setMessage(null)
    setError(null)
  }, [data, roleTab])

  const allFunctionCodes = useMemo(() => {
    if (!data) return [] as string[]
    return Object.values(data.functionsByModule)
      .flat()
      .map((f) => f.code)
  }, [data])

  const isEditableRole = Boolean(data?.editableRoles.includes(roleTab))
  const isFullAccessRole = FULL_ACCESS.has(roleTab)

  const usersInRole = useMemo(() => {
    if (!data) return []
    let list = data.users.filter((u) => u.role === roleTab)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((u) => (u.display_name || '').toLowerCase().includes(q))
    }
    return [...list].sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    )
  }, [data, roleTab, search])

  const defaultUsers = useMemo(
    () => usersInRole.filter((u) => !u.hasExceptions),
    [usersInRole]
  )
  const exceptionUsers = useMemo(
    () => usersInRole.filter((u) => u.hasExceptions),
    [usersInRole]
  )

  const activeUser = useMemo(
    () => data?.users.find((u) => u.id === activeUserId) ?? null,
    [data, activeUserId]
  )

  useEffect(() => {
    if (!activeUser) {
      setDraftAdd([])
      setDraftRemove([])
      setExceptionsDirty(false)
      setLeaveDefaultConfirmed(false)
      return
    }
    setDraftAdd([...activeUser.overrides.add])
    setDraftRemove([...activeUser.overrides.remove])
    setExceptionsDirty(false)
    setLeaveDefaultConfirmed(activeUser.hasExceptions)
  }, [activeUser])

  const effectiveForActive = useMemo(() => {
    if (!activeUser) return new Set<string>()
    return computeEffective(
      activeUser.roleBase,
      draftAdd,
      draftRemove,
      FULL_ACCESS.has(activeUser.role),
      allFunctionCodes
    )
  }, [activeUser, draftAdd, draftRemove, allFunctionCodes])

  const toggleDefault = (code: string, checked: boolean) => {
    if (!canManage || !isEditableRole) return
    setDraftDefaults((prev) => {
      const next = new Set(prev)
      if (checked) next.add(code)
      else next.delete(code)
      return next
    })
    setDefaultsDirty(true)
  }

  const saveDefaults = async () => {
    if (!canManage || !isEditableRole) return
    const ok = window.confirm(
      'This updates the default for everyone in this type. Individual exceptions still override. Continue?'
    )
    if (!ok) return
    setSavingDefaults(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/permissions/role-defaults/${roleTab}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ function_codes: Array.from(draftDefaults) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.detail || body.error || 'Failed to save defaults')
      setMessage('Type default saved.')
      setDefaultsDirty(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save defaults')
    } finally {
      setSavingDefaults(false)
    }
  }

  const applyExceptionToggles = (codes: string[], wantOn: boolean) => {
    if (!activeUser || codes.length === 0) return
    setDraftAdd((prev) => {
      const next = new Set(prev)
      for (const code of codes) {
        next.delete(code)
        const inBase = activeUser.roleBase.includes(code)
        if (wantOn && !inBase) next.add(code)
      }
      return Array.from(next)
    })
    setDraftRemove((prev) => {
      const next = new Set(prev)
      for (const code of codes) {
        next.delete(code)
        const inBase = activeUser.roleBase.includes(code)
        if (!wantOn && inBase) next.add(code)
      }
      return Array.from(next)
    })
    setExceptionsDirty(true)
  }

  const requestExceptionToggles = (codes: string[], wantOn: boolean) => {
    if (!canManage || !activeUser || FULL_ACCESS.has(activeUser.role) || codes.length === 0) {
      return
    }
    if (!activeUser.hasExceptions && !leaveDefaultConfirmed) {
      setConfirmLeaveDefault({ codes, wantOn })
      return
    }
    applyExceptionToggles(codes, wantOn)
  }

  const toggleException = (code: string, wantOn: boolean) => {
    requestExceptionToggles([code], wantOn)
  }

  const toggleExceptionSection = (codes: string[], wantOn: boolean) => {
    requestExceptionToggles(codes, wantOn)
  }

  const saveExceptions = async () => {
    if (!canManage || !activeUser) return
    setSavingExceptions(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/permissions/user/${activeUser.id}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: draftAdd, remove: draftRemove }),
      })
      if (!res.ok) throw new Error('Failed to save exceptions')
      setMessage('Exceptions saved.')
      setExceptionsDirty(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save exceptions')
    } finally {
      setSavingExceptions(false)
    }
  }

  const clearUserToDefault = async (user: OverviewUser) => {
    setMovingToDefault(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`/api/permissions/user/${user.id}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add: [], remove: [] }),
      })
      if (!res.ok) throw new Error('Failed to move user to default')
      setMessage(`${user.display_name || 'User'} moved to On default.`)
      if (activeUserId === user.id) setActiveUserId(null)
      setConfirmMoveToDefault(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to move user to default')
    } finally {
      setMovingToDefault(false)
    }
  }

  const onDragStartUser = (e: DragEvent, userId: string) => {
    if (!canManage || isFullAccessRole) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('text/plain', userId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDropToDefault = (e: DragEvent) => {
    e.preventDefault()
    setDragOverDefault(false)
    if (!canManage || isFullAccessRole || !data) return
    const userId = e.dataTransfer.getData('text/plain')
    const user = data.users.find((u) => u.id === userId)
    if (!user || !user.hasExceptions || user.role !== roleTab) return
    setConfirmMoveToDefault(user)
  }

  if (loading && !data) {
    return <div className="text-xs text-muted-foreground">Loading permissions…</div>
  }
  if (!data) {
    return <div className="text-xs text-destructive">{error || 'Failed to load'}</div>
  }

  const modules = moduleKeys(data.functionsByModule)
  const cardClass = 'gap-2 py-2 shadow-sm rounded-none'
  const cardHeaderClass = 'px-3 py-0 gap-0.5'
  const cardContentClass = 'px-3 pt-0'

  return (
    <div className="min-w-0 max-w-full space-y-2 overflow-x-hidden text-xs">
      {(message || error) && (
        <p className={`text-xs ${error ? 'text-destructive' : 'text-muted-foreground'}`} role="status">
          {error || message}
        </p>
      )}

      <Tabs value={roleTab} onValueChange={setRoleTab} className="min-w-0 w-full">
        <TabsList className="flex h-auto min-h-0 w-full flex-wrap gap-0.5 p-0.5">
          {visibleRoleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="h-7 px-2 text-[11px] leading-none"
            >
              {tab.label} ({data.roleCounts[tab.id] ?? 0})
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={roleTab} className="mt-2 min-w-0 space-y-2 overflow-x-hidden">
          <Card className={cardClass}>
            <CardContent className={`${cardContentClass} space-y-1 py-2 text-xs leading-snug text-muted-foreground`}>
              <p>📦 <span className="text-foreground">Default pack</span> — what everyone of this type can do.</p>
              <p>✏️ <span className="text-foreground">Exceptions</span> — people with different access. Drag a name back to On default to reset them.</p>
            </CardContent>
          </Card>

          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle className="text-sm">
                Default pack — {ROLE_TABS.find((t) => t.id === roleTab)?.label ?? roleTab}
              </CardTitle>
              <CardDescription className="text-[11px] leading-snug">
                {isFullAccessRole
                  ? 'Full access (not editable).'
                  : 'Shared default for this type unless excepted.'}
              </CardDescription>
            </CardHeader>
            <CardContent className={`${cardContentClass} space-y-2`}>
              {isFullAccessRole ? (
                <p className="text-xs text-muted-foreground">Full access</p>
              ) : (
                <>
                  <div className="max-h-64 overflow-y-auto rounded-none border p-1.5">
                    <div className="columns-1 gap-x-4 sm:columns-2 lg:columns-3">
                      {modules.map((moduleKey) => {
                        const funcs = funcsForModule(moduleKey, data.functionsByModule)
                        if (!funcs.length) return null
                        const isOpen = openModules.has(moduleKey)
                        return (
                          <Collapsible
                            key={moduleKey}
                            open={isOpen}
                            onOpenChange={(open) =>
                              setOpenModules((prev) => {
                                const next = new Set(prev)
                                if (open) next.add(moduleKey)
                                else next.delete(moduleKey)
                                return next
                              })
                            }
                            className="mb-0.5 break-inside-avoid"
                          >
                            <CollapsibleTrigger className="flex w-full items-center gap-1 py-0.5 text-xs font-medium hover:opacity-80">
                              <ChevronDown
                                className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              />
                              <span className="truncate">
                                {MODULE_LABELS[moduleKey] ?? moduleKey}
                              </span>
                              <span className="ms-0.5 shrink-0 font-normal text-muted-foreground">
                                ({funcs.length})
                              </span>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-0.5 pb-1 ps-4">
                              {funcs.map((f) => (
                                <label
                                  key={f.code}
                                  className="flex cursor-pointer items-center gap-1.5 leading-tight"
                                >
                                  <Checkbox
                                    className="h-3.5 w-3.5"
                                    checked={draftDefaults.has(f.code)}
                                    disabled={!canManage || !isEditableRole}
                                    onCheckedChange={(c) => toggleDefault(f.code, c === true)}
                                  />
                                  <span className="text-xs">{f.label_en}</span>
                                </label>
                              ))}
                            </CollapsibleContent>
                          </Collapsible>
                        )
                      })}
                    </div>
                  </div>
                  {canManage && isEditableRole && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={!defaultsDirty || savingDefaults}
                      onClick={saveDefaults}
                    >
                      {savingDefaults ? 'Saving…' : 'Save type default'}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 max-w-[12rem] text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                {defaultUsers.length} on default · {exceptionUsers.length} with exceptions
                {canManage && !isFullAccessRole
                  ? ' · Drag from Exceptions onto On default to restore defaults'
                  : ''}
              </span>
            </div>

            <div className="grid gap-2 lg:grid-cols-2">
              <Card
                className={`${cardClass} ${dragOverDefault ? 'ring-2 ring-primary/40' : ''}`}
                onDragOver={(e) => {
                  if (!canManage || isFullAccessRole) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  setDragOverDefault(true)
                }}
                onDragLeave={() => setDragOverDefault(false)}
                onDrop={onDropToDefault}
              >
                <CardHeader className={cardHeaderClass}>
                  <CardTitle className="text-sm">
                    On default ({defaultUsers.length})
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Type default pack. Drop a name here to clear their exceptions.
                  </CardDescription>
                </CardHeader>
                <CardContent className={cardContentClass}>
                  <div className="max-h-64 overflow-auto rounded-none border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 text-left">
                        <tr className="border-b">
                          <th className="px-1.5 py-1 font-medium">Name</th>
                          <th className="px-1.5 py-1 font-medium">ERR</th>
                          <th className="px-1.5 py-1 font-medium">State</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultUsers.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-1.5 py-2 text-muted-foreground">
                              No users fully on default.
                            </td>
                          </tr>
                        )}
                        {defaultUsers.map((u) => {
                          const active = activeUserId === u.id
                          return (
                            <tr
                              key={u.id}
                              className={`border-b last:border-0 ${active ? 'bg-muted/60' : ''}`}
                            >
                              <td className="px-1.5 py-1 align-middle">
                                <button
                                  type="button"
                                  className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-left text-xs font-medium transition-colors hover:bg-muted ${
                                    active
                                      ? 'border-primary/40 bg-primary/10'
                                      : 'border-border bg-background'
                                  }`}
                                  onClick={() => setActiveUserId(u.id)}
                                >
                                  {u.display_name || u.id}
                                </button>
                              </td>
                              <td className="max-w-[8rem] truncate px-1.5 py-1 align-middle text-muted-foreground">
                                {u.err_name || '—'}
                              </td>
                              <td className="max-w-[7rem] truncate px-1.5 py-1 align-middle text-muted-foreground">
                                {u.state_name || '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <Card className={cardClass}>
                <CardHeader className={cardHeaderClass}>
                  <CardTitle className="text-sm">
                    Exceptions ({exceptionUsers.length})
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Differ from the type default. Drag onto On default to restore defaults.
                  </CardDescription>
                </CardHeader>
                <CardContent className={cardContentClass}>
                  <div className="max-h-64 overflow-auto rounded-none border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 text-left">
                        <tr className="border-b">
                          <th className="px-1.5 py-1 font-medium">Name</th>
                          <th className="px-1.5 py-1 font-medium">ERR</th>
                          <th className="px-1.5 py-1 font-medium">State</th>
                          <th className="px-1.5 py-1 font-medium">Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exceptionUsers.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-1.5 py-2 text-muted-foreground">
                              No users with exceptions.
                            </td>
                          </tr>
                        )}
                        {exceptionUsers.map((u) => {
                          const active = activeUserId === u.id
                          const extraCount = u.overrides.add.length
                          const takenCount = u.overrides.remove.length
                          const canDrag = canManage && !isFullAccessRole
                          return (
                            <tr
                              key={u.id}
                              className={`border-b last:border-0 ${active ? 'bg-amber-50' : ''}`}
                            >
                              <td className="px-1.5 py-1 align-middle">
                                <button
                                  type="button"
                                  draggable={canDrag}
                                  onDragStart={(e) => onDragStartUser(e, u.id)}
                                  title={
                                    canDrag
                                      ? 'Drag to On default to restore type defaults. Click to edit.'
                                      : 'Click to edit'
                                  }
                                  className={`inline-flex max-w-full items-center gap-1 truncate rounded-full border px-2 py-0.5 text-left text-xs font-medium transition-colors ${
                                    canDrag
                                      ? 'cursor-grab active:cursor-grabbing border-amber-300 bg-amber-50 hover:bg-amber-100'
                                      : 'border-border bg-background hover:bg-muted'
                                  } ${active ? 'ring-1 ring-primary/40' : ''}`}
                                  onClick={() => setActiveUserId(u.id)}
                                >
                                  {canDrag && (
                                    <GripVertical
                                      className="h-3 w-3 shrink-0 text-amber-700/70"
                                      aria-hidden
                                    />
                                  )}
                                  <span className="truncate">{u.display_name || u.id}</span>
                                </button>
                              </td>
                              <td className="max-w-[7rem] truncate px-1.5 py-1 align-middle text-muted-foreground">
                                {u.err_name || '—'}
                              </td>
                              <td className="max-w-[6rem] truncate px-1.5 py-1 align-middle text-muted-foreground">
                                {u.state_name || '—'}
                              </td>
                              <td className="whitespace-nowrap px-1.5 py-1 align-middle text-muted-foreground">
                                {extraCount > 0 ? `+${extraCount}` : ''}
                                {extraCount > 0 && takenCount > 0 ? ' · ' : ''}
                                {takenCount > 0 ? `−${takenCount}` : ''}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {activeUser && !FULL_ACCESS.has(activeUser.role) && (
              <Card className={`${cardClass} min-w-0 overflow-hidden`}>
                <CardHeader className={cardHeaderClass}>
                  <CardTitle className="text-sm">
                    Edit — {activeUser.display_name || activeUser.id}
                  </CardTitle>
                  <CardDescription className="text-[11px] leading-snug">
                    Granted = on beyond the type default. Removed = off despite the type default.
                    Clearing all exceptions moves them back to On default.
                  </CardDescription>
                </CardHeader>
                <CardContent className={`${cardContentClass} min-w-0 space-y-2`}>
                  <div className="w-full min-w-0 overflow-x-hidden rounded-none border p-1.5">
                    <div className="w-full min-w-0 columns-1 gap-x-4 sm:columns-2 xl:columns-3">
                      {modules.map((moduleKey) => {
                        const funcs = funcsForModule(moduleKey, data.functionsByModule)
                        if (!funcs.length) return null
                        const sectionCodes = funcs.map((f) => f.code)
                        const onCount = sectionCodes.filter((c) =>
                          effectiveForActive.has(c)
                        ).length
                        const allOn = onCount === sectionCodes.length
                        const someOn = onCount > 0 && !allOn
                        return (
                          <div
                            key={moduleKey}
                            className="mb-2 break-inside-avoid space-y-0.5"
                          >
                            <label className="flex min-w-0 cursor-pointer items-center gap-1.5">
                              <Checkbox
                                className="h-3.5 w-3.5 shrink-0"
                                checked={allOn ? true : someOn ? 'indeterminate' : false}
                                disabled={!canManage}
                                onCheckedChange={(c) =>
                                  toggleExceptionSection(sectionCodes, c === true)
                                }
                                aria-label={`Toggle all ${MODULE_LABELS[moduleKey] ?? moduleKey}`}
                              />
                              <span className="text-[11px] font-medium text-muted-foreground">
                                {MODULE_LABELS[moduleKey] ?? moduleKey}
                              </span>
                            </label>
                            {funcs.map((f) => {
                              const on = effectiveForActive.has(f.code)
                              const extra = draftAdd.includes(f.code)
                              const taken = draftRemove.includes(f.code)
                              return (
                                <label
                                  key={f.code}
                                  className="flex min-w-0 cursor-pointer items-start gap-1.5 ps-5 leading-tight"
                                >
                                  <Checkbox
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                                    checked={on}
                                    disabled={!canManage}
                                    onCheckedChange={(c) =>
                                      toggleException(f.code, c === true)
                                    }
                                  />
                                  <span className="min-w-0 flex-1 break-words text-xs">
                                    {f.label_en}
                                    {extra && (
                                      <span className="ms-1.5 whitespace-nowrap text-[10px] text-emerald-700">
                                        Granted
                                      </span>
                                    )}
                                    {taken && (
                                      <span className="ms-1.5 whitespace-nowrap text-[10px] text-rose-700">
                                        Removed
                                      </span>
                                    )}
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={!exceptionsDirty || savingExceptions}
                      onClick={saveExceptions}
                    >
                      {savingExceptions ? 'Saving…' : 'Save exceptions'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={confirmLeaveDefault != null}
        onOpenChange={(open) => {
          if (!open) setConfirmLeaveDefault(null)
        }}
      >
        <DialogContent className="max-w-sm gap-3 rounded-none p-4 sm:rounded-none">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Move to Exceptions?</DialogTitle>
            <DialogDescription className="text-xs">
              Changing permissions for{' '}
              <span className="font-medium text-foreground">
                {activeUser?.display_name || 'this user'}
              </span>{' '}
              will move them from On default to Exceptions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setConfirmLeaveDefault(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (!confirmLeaveDefault) return
                setLeaveDefaultConfirmed(true)
                applyExceptionToggles(confirmLeaveDefault.codes, confirmLeaveDefault.wantOn)
                setConfirmLeaveDefault(null)
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmMoveToDefault != null}
        onOpenChange={(open) => {
          if (!open && !movingToDefault) setConfirmMoveToDefault(null)
        }}
      >
        <DialogContent className="max-w-sm gap-3 rounded-none p-4 sm:rounded-none">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Restore type defaults?</DialogTitle>
            <DialogDescription className="text-xs">
              Move{' '}
              <span className="font-medium text-foreground">
                {confirmMoveToDefault?.display_name || 'this user'}
              </span>{' '}
              to On default and clear their exceptions.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={movingToDefault}
              onClick={() => setConfirmMoveToDefault(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={movingToDefault || !confirmMoveToDefault}
              onClick={() => {
                if (confirmMoveToDefault) void clearUserToDefault(confirmMoveToDefault)
              }}
            >
              {movingToDefault ? 'Moving…' : 'Move to On default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
