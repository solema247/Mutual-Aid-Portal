'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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
import { ChevronDown } from 'lucide-react'
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

interface PermissionsManagerProps {
  currentUserRole: string
  currentUserErrId: string | null
}

interface UserOption {
  id: string
  display_name: string | null
  role: string
}

export default function PermissionsManager({
  currentUserRole,
  currentUserErrId
}: PermissionsManagerProps) {
  const searchParams = useSearchParams()
  const [functionsByModule, setFunctionsByModule] = useState<
    Record<string, FunctionDefinition[]>
  >({})
  const [users, setUsers] = useState<UserOption[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [allowed, setAllowed] = useState<Set<string>>(new Set())
  const [roleBase, setRoleBase] = useState<Set<string>>(new Set())
  const [add, setAdd] = useState<string[]>([])
  const [remove, setRemove] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingUser, setLoadingUser] = useState(false)
  const [loadingFunctions, setLoadingFunctions] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const moduleOrder = ['grants', 'f1', 'f2', 'f3', 'f4_f5', 'management', 'users', 'rooms', 'dashboard'] as const
  const [openModules, setOpenModules] = useState<Set<string>>(
    () => new Set(moduleOrder)
  )

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
        const list = u
          .filter((x) => currentUserRole === 'support' || x.role !== 'support')
          .map((x) => ({
            id: x.id,
            display_name: x.display_name,
            role: x.role
          }))
        setUsers(list)
        const fromUrl = searchParams.get('userId')
        if (fromUrl && list.some((x) => x.id === fromUrl)) {
          setSelectedUserId(fromUrl)
        }
      })
      .finally(() => setLoadingUsers(false))
  }, [currentUserRole, currentUserErrId])

  const loadUserPermissions = useCallback(async (userId: string) => {
    if (!userId) return
    setLoadingUser(true)
    try {
      const r = await fetch(`/api/permissions/user/${userId}`)
      if (!r.ok) throw new Error('Failed to load')
      const data = await r.json()
      setAllowed(new Set(data.allowed ?? []))
      setRoleBase(new Set(data.roleBase ?? []))
      setAdd(Array.isArray(data.overrides?.add) ? data.overrides.add : [])
      setRemove(Array.isArray(data.overrides?.remove) ? data.overrides.remove : [])
    } catch {
      setAllowed(new Set())
      setRoleBase(new Set())
      setAdd([])
      setRemove([])
    } finally {
      setLoadingUser(false)
    }
  }, [])

  useEffect(() => {
    if (selectedUserId) loadUserPermissions(selectedUserId)
  }, [selectedUserId, loadUserPermissions])

  const handleToggle = (code: string, checked: boolean) => {
    setAllowed((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(code)
      } else {
        next.delete(code)
      }
      return next
    })
    setRemove((prev) => {
      if (checked) return prev.filter((c) => c !== code)
      if (roleBase.has(code)) return [...prev, code]
      return prev
    })
    setAdd((prev) => {
      if (!checked) return prev.filter((c) => c !== code)
      if (!roleBase.has(code)) return [...prev, code]
      return prev
    })
  }

  const handleSave = async () => {
    if (!selectedUserId) return
    setSaving(true)
    try {
      const r = await fetch(`/api/permissions/user/${selectedUserId}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add, remove })
      })
      if (!r.ok) throw new Error('Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loadingFunctions || loadingUsers) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Select user</CardTitle>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedUserId || '__none__'}
            onValueChange={(v) => setSelectedUserId(v === '__none__' ? '' : v)}
            disabled={users.length === 0}
          >
            <SelectTrigger className="w-[320px] border-input bg-background">
              <SelectValue placeholder="Select user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select user</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.display_name || u.id} ({u.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Permissions</CardTitle>
            <Button onClick={handleSave} disabled={saving || loadingUser}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </CardHeader>
          <CardContent>
            {loadingUser ? (
              <div className="text-muted-foreground">Loading permissions...</div>
            ) : (
              <div className="space-y-2">
                {moduleOrder.map((moduleKey) => {
                  // Combine F4 and F5 into one section (same page)
                  const rawFuncs =
                    moduleKey === 'f4_f5'
                      ? [...(functionsByModule['f4'] || []), ...(functionsByModule['f5'] || [])]
                      : functionsByModule[moduleKey]
                  if (!rawFuncs?.length) return null
                  // Hide f1_assign_grant from permissions UI (not adjustable per user)
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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {funcs.map((f) => (
                            <TableRow key={f.code} className="border-b hover:bg-muted/50">
                              <TableCell className="py-1 px-2">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <Checkbox
                                    checked={allowed.has(f.code)}
                                    onCheckedChange={(checked) =>
                                      handleToggle(f.code, checked === true)
                                    }
                                  />
                                  <span className="text-xs">{f.label_en}</span>
                                </label>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-xs py-1 px-2">
                                {f.description_en ?? '—'}
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
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
