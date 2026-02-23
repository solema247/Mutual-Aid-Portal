'use client'

import { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { ChevronDown, ArrowRight, ArrowLeft } from 'lucide-react'
import { getActiveUsers } from '@/app/api/users/utils/users'
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
  dashboard: 'Dashboard'
}

const PAGE_SIZE = 10

function getStateName(user: { emergency_rooms?: unknown }): string {
  const er = user.emergency_rooms
  if (!er) return '—'
  const state = Array.isArray(er) ? (er[0] as { state?: { state_name?: string } })?.state : (er as { state?: { state_name?: string } })?.state
  return state?.state_name ?? '—'
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Admin',
    superadmin: 'Superadmin',
    state_err: 'State ERR',
    base_err: 'Base ERR'
  }
  return labels[role] ?? role
}

interface BulkPermissionsManagerProps {
  currentUserRole: string
  currentUserErrId: string | null
}

interface UserOption {
  id: string
  display_name: string | null
  role: string
  state_name: string
}

export default function BulkPermissionsManager({
  currentUserRole,
  currentUserErrId
}: BulkPermissionsManagerProps) {
  const [functionsByModule, setFunctionsByModule] = useState<
    Record<string, FunctionDefinition[]>
  >({})
  const [allUsers, setAllUsers] = useState<UserOption[]>([])
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([])
  const [add, setAdd] = useState<Set<string>>(new Set())
  const [remove, setRemove] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [loadingFunctions, setLoadingFunctions] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [availablePage, setAvailablePage] = useState(1)
  const moduleOrder = ['grants', 'f1', 'f2', 'f3', 'f4_f5', 'management', 'users', 'rooms', 'dashboard'] as const
  const [openModules, setOpenModules] = useState<Set<string>>(
    () => new Set(moduleOrder)
  )

  const selectedIds = useMemo(() => new Set(selectedUsers.map((u) => u.id)), [selectedUsers])
  const availableUsers = useMemo(
    () => allUsers.filter((u) => !selectedIds.has(u.id)),
    [allUsers, selectedIds]
  )
  const totalAvailablePages = Math.max(1, Math.ceil(availableUsers.length / PAGE_SIZE))
  const availablePaginated = useMemo(
    () =>
      availableUsers.slice(
        (availablePage - 1) * PAGE_SIZE,
        availablePage * PAGE_SIZE
      ),
    [availableUsers, availablePage]
  )

  useEffect(() => {
    if (totalAvailablePages > 0 && availablePage > totalAvailablePages) {
      setAvailablePage(totalAvailablePages)
    }
  }, [totalAvailablePages, availablePage])

  useEffect(() => {
    fetch('/api/permissions/functions')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        setFunctionsByModule(data)
      })
      .finally(() => setLoadingFunctions(false))
  }, [])

  useEffect(() => {
    getActiveUsers({
      page: 1,
      pageSize: 500,
      status: 'active',
      currentUserRole,
      currentUserErrId
    })
      .then(({ users: u }) => {
        const list = (u || [])
          .filter((x: { role: string }) => x.role !== 'superadmin')
          .map((x: { id: string; display_name: string | null; role: string; emergency_rooms?: unknown }) => ({
            id: x.id,
            display_name: x.display_name,
            role: x.role,
            state_name: getStateName(x)
          }))
        setAllUsers(list)
      })
      .finally(() => setLoadingUsers(false))
  }, [currentUserRole, currentUserErrId])

  const addToSelected = (user: UserOption) => {
    setSelectedUsers((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]))
  }

  const removeFromSelected = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId))
  }

  const setGrant = (code: string, granted: boolean) => {
    if (granted) {
      setAdd((prev) => new Set(prev).add(code))
      setRemove((prev) => {
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    } else {
      setAdd((prev) => {
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    }
  }

  const setRevoke = (code: string, revoked: boolean) => {
    if (revoked) {
      setRemove((prev) => new Set(prev).add(code))
      setAdd((prev) => {
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    } else {
      setRemove((prev) => {
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    }
  }

  const handleApply = async () => {
    if (selectedUsers.length === 0) return
    setApplying(true)
    try {
      const res = await fetch('/api/permissions/bulk-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_ids: selectedUsers.map((u) => u.id),
          add: Array.from(add),
          remove: Array.from(remove)
        })
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Failed to apply')
        return
      }
      const data = await res.json()
      alert(`Applied to ${data.count ?? selectedUsers.length} user(s).`)
    } finally {
      setApplying(false)
    }
  }

  if (loadingFunctions || loadingUsers) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Select users</CardTitle>
          <p className="text-sm text-muted-foreground">
            Add users from the left table to the right, then set Grant/Revoke below and click Apply.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-start">
            {/* All users */}
            <div className="border rounded-md overflow-hidden">
              <div className="bg-muted/50 px-2 py-1 font-medium text-xs border-b">
                All users
              </div>
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] py-1 px-2 font-medium">Name</TableHead>
                      <TableHead className="text-[11px] py-1 px-2 font-medium">User type</TableHead>
                      <TableHead className="text-[11px] py-1 px-2 font-medium">State</TableHead>
                      <TableHead className="w-[64px] text-[11px] py-1 px-2 font-medium text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingUsers ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : availablePaginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">
                          {availableUsers.length === 0 && selectedUsers.length === 0
                            ? 'No users'
                            : 'No users on this page'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      availablePaginated.map((u) => (
                        <TableRow key={u.id} className="border-b">
                          <TableCell className="text-[11px] leading-tight py-1 px-2">{u.display_name || u.id}</TableCell>
                          <TableCell className="text-[11px] leading-tight py-1 px-2">{roleLabel(u.role)}</TableCell>
                          <TableCell className="text-[11px] leading-tight py-1 px-2">{u.state_name}</TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => addToSelected(u)}
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {!loadingUsers && availableUsers.length > PAGE_SIZE && (
                <div className="flex items-center justify-between px-2 py-1.5 border-t text-[11px] text-muted-foreground">
                  <span>
                    Page {availablePage} of {totalAvailablePages} ({availableUsers.length} available)
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px]"
                      disabled={availablePage <= 1}
                      onClick={() => setAvailablePage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px]"
                      disabled={availablePage >= totalAvailablePages}
                      onClick={() => setAvailablePage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Spacer / transfer label on large screens */}
            <div className="hidden lg:flex flex-col items-center justify-center pt-10 text-muted-foreground">
              <span className="text-[11px]">Add →</span>
            </div>

            {/* Selected users */}
            <div className="border rounded-md overflow-hidden">
              <div className="bg-muted/50 px-2 py-1 font-medium text-xs border-b">
                Selected users ({selectedUsers.length})
              </div>
              <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b hover:bg-transparent">
                      <TableHead className="text-[11px] py-1 px-2 font-medium">Name</TableHead>
                      <TableHead className="text-[11px] py-1 px-2 font-medium">User type</TableHead>
                      <TableHead className="text-[11px] py-1 px-2 font-medium">State</TableHead>
                      <TableHead className="w-[64px] text-[11px] py-1 px-2 font-medium text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-4">
                          No users selected
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedUsers.map((u) => (
                        <TableRow key={u.id} className="border-b">
                          <TableCell className="text-[11px] leading-tight py-1 px-2">{u.display_name || u.id}</TableCell>
                          <TableCell className="text-[11px] leading-tight py-1 px-2">{roleLabel(u.role)}</TableCell>
                          <TableCell className="text-[11px] leading-tight py-1 px-2">{u.state_name}</TableCell>
                          <TableCell className="py-1 px-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => removeFromSelected(u.id)}
                            >
                              <ArrowLeft className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Permissions to apply</CardTitle>
          <Button
            onClick={handleApply}
            disabled={applying || selectedUsers.length === 0}
          >
            {applying ? 'Applying...' : `Apply to ${selectedUsers.length} user(s)`}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Grant: add this permission for selected users. Revoke: remove this permission for selected users. Leave both unchecked to leave unchanged.
          </p>
          <div className="space-y-2">
            {moduleOrder.map((moduleKey) => {
              const rawFuncs =
                moduleKey === 'f4_f5'
                  ? [...(functionsByModule['f4'] || []), ...(functionsByModule['f5'] || [])]
                  : functionsByModule[moduleKey]
              if (!rawFuncs?.length) return null
              const funcs =
                moduleKey === 'f1'
                  ? rawFuncs.filter((f) => f.code !== 'f1_assign_grant')
                  : rawFuncs
              if (!funcs.length) return null
              const label = MODULE_LABELS[moduleKey] ?? moduleKey
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
                >
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium hover:opacity-80 py-0 leading-tight">
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                    <span>{label}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-b hover:bg-transparent">
                          <TableHead className="h-auto w-[200px] py-1 px-2 text-xs font-medium">Action</TableHead>
                          <TableHead className="h-auto py-1 px-2 text-xs font-medium">Description</TableHead>
                          <TableHead className="h-auto w-[80px] py-1 px-2 text-xs font-medium text-center">Grant</TableHead>
                          <TableHead className="h-auto w-[80px] py-1 px-2 text-xs font-medium text-center">Revoke</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {funcs.map((f) => (
                          <TableRow key={f.code} className="border-b hover:bg-muted/50">
                            <TableCell className="py-1 px-2 text-xs">
                              {f.label_en}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs py-1 px-2">
                              {f.description_en ?? '—'}
                            </TableCell>
                            <TableCell className="py-1 px-2 text-center">
                              <Checkbox
                                checked={add.has(f.code)}
                                onCheckedChange={(c) => setGrant(f.code, c === true)}
                              />
                            </TableCell>
                            <TableCell className="py-1 px-2 text-center">
                              <Checkbox
                                checked={remove.has(f.code)}
                                onCheckedChange={(c) => setRevoke(f.code, c === true)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
