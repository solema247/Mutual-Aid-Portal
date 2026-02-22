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
import { getActiveUsers } from '@/app/api/users/utils/users'
import type { FunctionDefinition } from '@/lib/permissions'

const MODULE_LABELS: Record<string, string> = {
  f1: 'F1 Work Plans',
  f2: 'F2 Approvals',
  f3: 'F3 MOUs',
  f4: 'F4 Reporting',
  f5: 'F5 Reporting',
  users: 'User Management',
  grants: 'Grant Management'
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
          .filter((x) => x.role !== 'superadmin')
          .map((x) => ({
            id: x.id,
            display_name: x.display_name,
            role: x.role
          }))
        setUsers(list)
        const fromUrl = searchParams.get('userId')
        if (fromUrl && list.some((x) => x.id === fromUrl)) {
          setSelectedUserId(fromUrl)
        } else if (list.length > 0 && !selectedUserId) {
          setSelectedUserId(list[0].id)
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

  const moduleOrder = ['f1', 'f2', 'f3', 'f4', 'f5', 'users', 'grants']

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
            value={selectedUserId}
            onValueChange={setSelectedUserId}
            disabled={users.length === 0}
          >
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Choose user" />
            </SelectTrigger>
            <SelectContent>
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
              <div className="space-y-6">
                {moduleOrder.map((moduleKey) => {
                  const funcs = functionsByModule[moduleKey]
                  if (!funcs?.length) return null
                  const label = MODULE_LABELS[moduleKey] ?? moduleKey
                  return (
                    <div key={moduleKey}>
                      <h3 className="font-medium mb-2">{label}</h3>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {funcs.map((f) => (
                          <label
                            key={f.code}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Checkbox
                              checked={allowed.has(f.code)}
                              onCheckedChange={(checked) =>
                                handleToggle(f.code, checked === true)
                              }
                            />
                            <span className="text-sm">{f.label_en}</span>
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
