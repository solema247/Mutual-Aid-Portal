'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getActiveUsers } from '@/app/api/users/utils/users'
import type { FunctionDefinition } from '@/lib/permissions'

const MODULE_LABELS: Record<string, string> = {
  f1: 'F1 Work Plans',
  f2: 'F2 Approvals',
  f3: 'F3 MOUs',
  grant: 'Grant Management',
  f4f5: 'F4 & F5 Reporting',
  users: 'User Management',
  rooms: 'Room Management',
}

interface UserOption {
  id: string
  display_name: string | null
  role: string
  state_name?: string
}

interface PermissionsManagerProps {
  currentUserRole: string
  currentUserErrId: string | null
}

export default function PermissionsManager({
  currentUserRole,
  currentUserErrId,
}: PermissionsManagerProps) {
  const [users, setUsers] = useState<UserOption[]>([])
  const [functionsByModule, setFunctionsByModule] = useState<Record<string, FunctionDefinition[]>>({})
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [allowed, setAllowed] = useState<Set<string>>(new Set())
  const [roleBase, setRoleBase] = useState<Set<string>>(new Set())
  const [add, setAdd] = useState<string[]>([])
  const [remove, setRemove] = useState<string[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingFunctions, setLoadingFunctions] = useState(true)
  const [loadingUserPerms, setLoadingUserPerms] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const { users: list } = await getActiveUsers({
        page: 1,
        pageSize: 500,
        status: 'active',
        currentUserRole,
        currentUserErrId,
      })
      const filtered = list
        .filter((u) => u.role !== 'superadmin')
        .map((u) => ({
          id: u.id,
          display_name: u.display_name,
          role: u.role,
          state_name: (u as any).emergency_rooms?.state?.state_name,
        }))
      setUsers(filtered)
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: 'Failed to load users' })
    } finally {
      setLoadingUsers(false)
    }
  }, [currentUserRole, currentUserErrId])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    const f = async () => {
      setLoadingFunctions(true)
      try {
        const res = await fetch('/api/permissions/functions')
        if (!res.ok) throw new Error('Failed to load functions')
        const data = await res.json()
        setFunctionsByModule(data)
      } catch (e) {
        console.error(e)
        setMessage({ type: 'error', text: 'Failed to load functions' })
      } finally {
        setLoadingFunctions(false)
      }
    }
    f()
  }, [])

  useEffect(() => {
    if (!selectedUserId) {
      setAllowed(new Set())
      setRoleBase(new Set())
      setAdd([])
      setRemove([])
      return
    }
    setLoadingUserPerms(true)
    fetch(`/api/permissions/user/${selectedUserId}`)
      .then((r) => r.json())
      .then((data) => {
        setAllowed(new Set(data.allowed || []))
        setRoleBase(new Set(data.roleBase || []))
        setAdd(data.overrides?.add || [])
        setRemove(data.overrides?.remove || [])
      })
      .catch((e) => {
        console.error(e)
        setMessage({ type: 'error', text: 'Failed to load user permissions' })
      })
      .finally(() => setLoadingUserPerms(false))
  }, [selectedUserId])

  const isAllowed = (code: string) => allowed.has(code)

  const toggle = (code: string, checked: boolean) => {
    const inBase = roleBase.has(code)
    if (checked) {
      setRemove((prev) => prev.filter((c) => c !== code))
      if (!inBase) setAdd((prev) => (prev.includes(code) ? prev : [...prev, code]))
      setAllowed((prev) => new Set(prev).add(code))
    } else {
      setAdd((prev) => prev.filter((c) => c !== code))
      if (inBase) setRemove((prev) => (prev.includes(code) ? prev : [...prev, code]))
      setAllowed((prev) => {
        const next = new Set(prev)
        next.delete(code)
        return next
      })
    }
  }

  const saveOverrides = async () => {
    if (!selectedUserId) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/permissions/user/${selectedUserId}/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ add, remove }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setMessage({ type: 'success', text: 'Permissions saved.' })
    } catch (e) {
      console.error(e)
      setMessage({ type: 'error', text: 'Failed to save permissions' })
    } finally {
      setSaving(false)
    }
  }

  const selectedUser = users.find((u) => u.id === selectedUserId)
  const hasChanges =
    add.length > 0 || remove.length > 0

  const moduleOrder = ['f1', 'f2', 'f3', 'grant', 'f4f5', 'users', 'rooms']

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select user</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose a user to view and edit their function permissions. Superadmins are not listed.
          </p>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <p className="text-muted-foreground text-sm">Loading users...</p>
          ) : (
            <Select value={selectedUserId ?? ''} onValueChange={(v) => setSelectedUserId(v || null)}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.display_name || u.id} — {u.role}
                    {u.state_name ? ` (${u.state_name})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">
                Permissions for {selectedUser?.display_name || selectedUserId}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Role: {selectedUser?.role}. Check the actions this user is allowed to perform.
              </p>
            </div>
            {hasChanges && (
              <Button onClick={saveOverrides} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {message && (
              <div
                className={`mb-4 text-sm p-3 rounded ${
                  message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {message.text}
              </div>
            )}
            {loadingUserPerms ? (
              <p className="text-muted-foreground text-sm">Loading permissions...</p>
            ) : (
              <div className="space-y-6">
                {moduleOrder.map((moduleKey) => {
                  const funcs = functionsByModule[moduleKey]
                  if (!funcs?.length) return null
                  const label = MODULE_LABELS[moduleKey] || moduleKey
                  return (
                    <div key={moduleKey} className="space-y-2">
                      <h3 className="font-medium text-sm text-muted-foreground border-b pb-1">
                        {label}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {funcs.map((f) => (
                          <label
                            key={f.code}
                            className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded p-2"
                          >
                            <Checkbox
                              checked={isAllowed(f.code)}
                              onCheckedChange={(checked) => toggle(f.code, !!checked)}
                            />
                            <span className="truncate" title={f.label_en}>
                              {f.label_en}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
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
