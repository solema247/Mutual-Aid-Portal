'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { rolesAssignableBy, type PortalRole } from '@/lib/userAccessRules'

type StateOption = { id: string; state_name: string }
type PartnerOption = { id: string; name: string }
type RoomOption = {
  id: string
  name: string
  err_code: string | null
  state_name: string | null
}

type AddUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserRole: string
  onCreated: () => void
}

const ROLE_LABELS: Record<PortalRole, string> = {
  support: 'Support',
  superadmin: 'Super Admin',
  admin: 'Admin',
  state_err: 'State ERR',
  base_err: 'Base ERR',
  partner: 'Partner',
}

export default function AddUserDialog({
  open,
  onOpenChange,
  currentUserRole,
  onCreated,
}: AddUserDialogProps) {
  const { t } = useTranslation(['users', 'common'])
  const assignableRoles = useMemo(
    () => rolesAssignableBy(currentUserRole),
    [currentUserRole]
  )

  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [displayNameTouched, setDisplayNameTouched] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<PortalRole | ''>('')
  const [status, setStatus] = useState<'active' | 'suspended'>('active')
  const [partnerId, setPartnerId] = useState('')
  const [canSeeAllStates, setCanSeeAllStates] = useState(true)
  const [selectedStateIds, setSelectedStateIds] = useState<string[]>([])
  const [baseStateName, setBaseStateName] = useState('')
  const [errId, setErrId] = useState('')

  const [states, setStates] = useState<StateOption[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [rooms, setRooms] = useState<RoomOption[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createdPassword, setCreatedPassword] = useState<string | null>(null)
  const [createdName, setCreatedName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const resetForm = useCallback(() => {
    setFirstName('')
    setSecondName('')
    setDisplayName('')
    setDisplayNameTouched(false)
    setEmail('')
    setRole('')
    setStatus('active')
    setPartnerId('')
    setCanSeeAllStates(true)
    setSelectedStateIds([])
    setBaseStateName('')
    setErrId('')
    setError(null)
    setSaving(false)
    setCopied(false)
  }, [])

  useEffect(() => {
    if (!open) return
    if (!createdPassword) resetForm()
  }, [open, createdPassword, resetForm])

  useEffect(() => {
    if (!displayNameTouched) {
      setDisplayName([firstName, secondName].filter(Boolean).join(' ').trim())
    }
  }, [firstName, secondName, displayNameTouched])

  useEffect(() => {
    if (!open) return
    ;(async () => {
      try {
        const res = await fetch('/api/states')
        if (res.ok) {
          const data = await res.json()
          setStates(
            (data || []).map((s: StateOption) => ({
              id: s.id,
              state_name: s.state_name,
            }))
          )
        }
      } catch (e) {
        console.error('Failed to load states', e)
      }
      try {
        const { data, error: partnersError } = await supabase
          .from('partners')
          .select('id, name')
          .eq('status', 'active')
          .order('name')
        if (partnersError) throw partnersError
        setPartners((data || []) as PartnerOption[])
      } catch (e) {
        console.error('Failed to load partners', e)
      }
    })()
  }, [open])

  useEffect(() => {
    if (!open || role !== 'base_err') {
      setRooms([])
      return
    }
    ;(async () => {
      try {
        const { data, error: roomsError } = await supabase
          .from('emergency_rooms')
          .select(
            `
            id,
            name,
            err_code,
            state:states!emergency_rooms_state_reference_fkey(
              state_name
            )
          `
          )
          .eq('status', 'active')
          .order('name')
        if (roomsError) throw roomsError
        const mapped: RoomOption[] = ((data || []) as Array<{
          id: string
          name: string | null
          err_code: string | null
          state: { state_name: string } | { state_name: string }[] | null
        }>).map((row) => {
          const state = Array.isArray(row.state) ? row.state[0] : row.state
          return {
            id: row.id,
            name: row.name || '',
            err_code: row.err_code ?? null,
            state_name: state?.state_name ?? null,
          }
        })
        setRooms(mapped)
      } catch (e) {
        console.error('Failed to load ERRs', e)
        setRooms([])
      }
    })()
  }, [open, role])

  const roomsForState = useMemo(() => {
    if (!baseStateName) return []
    return rooms.filter((r) => r.state_name === baseStateName)
  }, [rooms, baseStateName])

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setCreatedPassword(null)
      setCreatedName(null)
      resetForm()
    }
    onOpenChange(nextOpen)
  }

  const toggleState = (stateId: string, checked: boolean) => {
    setSelectedStateIds((prev) =>
      checked ? [...prev, stateId] : prev.filter((id) => id !== stateId)
    )
  }

  const handleCreate = async () => {
    setError(null)
    if (!role) {
      setError('Role is required')
      return
    }
    if (!email.trim() || !displayName.trim()) {
      setError('Email and display name are required')
      return
    }

    const body: Record<string, unknown> = {
      email: email.trim(),
      display_name: displayName.trim(),
      role,
      status,
    }

    if (role === 'partner') {
      if (!partnerId) {
        setError('Partner organization is required')
        return
      }
      body.partner_id = partnerId
    } else if (role === 'state_err') {
      body.can_see_all_states = canSeeAllStates
      body.visible_states = canSeeAllStates ? [] : selectedStateIds
      if (!canSeeAllStates && selectedStateIds.length === 0) {
        setError('Select at least one state, or enable All States')
        return
      }
    } else if (role === 'base_err') {
      if (!errId) {
        setError('ERR is required for Base ERR')
        return
      }
      body.err_id = errId
    }

    try {
      setSaving(true)
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user')
      }
      setCreatedPassword(data.temporary_password || null)
      setCreatedName(data.user?.display_name || displayName.trim())
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  const copyPassword = async () => {
    if (!createdPassword) return
    try {
      await navigator.clipboard.writeText(createdPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Failed to copy password')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto text-sm">
        {createdPassword ? (
          <>
            <DialogHeader>
              <DialogTitle>User created</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p>
                Account for <strong>{createdName}</strong> was created successfully.
              </p>
              <p className="text-muted-foreground">
                Copy the temporary password now. It will not be shown again. The user must
                change it after first login.
              </p>
              <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono break-all">
                {createdPassword}
              </div>
              {error && <p className="text-destructive text-xs">{error}</p>}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={copyPassword}>
                {copied ? 'Copied' : 'Copy Password'}
              </Button>
              <Button type="button" onClick={() => handleClose(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('users:add_user', { defaultValue: 'Add User' })}</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {error && <p className="text-destructive text-xs">{error}</p>}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="add-user-first">First Name</Label>
                  <Input
                    id="add-user-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="add-user-second">Second Name</Label>
                  <Input
                    id="add-user-second"
                    value={secondName}
                    onChange={(e) => setSecondName(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-user-display">Display Name</Label>
                <Input
                  id="add-user-display"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayNameTouched(true)
                    setDisplayName(e.target.value)
                  }}
                  className="h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="add-user-email">Email</Label>
                <Input
                  id="add-user-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-8"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1">
                <Label>Role</Label>
                <Select
                  value={role || undefined}
                  onValueChange={(value) => {
                    const next = value as PortalRole
                    setRole(next)
                    setPartnerId('')
                    setErrId('')
                    setBaseStateName('')
                    setCanSeeAllStates(true)
                    setSelectedStateIds([])
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select role…" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {role === 'partner' && (
                <div className="space-y-1">
                  <Label>Partner Organization</Label>
                  <Select value={partnerId || undefined} onValueChange={setPartnerId}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select partner…" />
                    </SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {role === 'state_err' && (
                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs font-medium">State Access</Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setCanSeeAllStates(false)
                          setSelectedStateIds(states.map((s) => s.id))
                        }}
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setCanSeeAllStates(false)
                          setSelectedStateIds([])
                        }}
                      >
                        Clear All
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-user-all-states"
                      checked={canSeeAllStates}
                      onCheckedChange={(checked) => {
                        const on = checked === true
                        setCanSeeAllStates(on)
                        if (on) setSelectedStateIds([])
                      }}
                    />
                    <label htmlFor="add-user-all-states" className="text-xs cursor-pointer">
                      All States
                    </label>
                  </div>
                  {!canSeeAllStates && (
                    <div className="max-h-40 overflow-y-auto space-y-1 border-t pt-2">
                      {states.map((state) => (
                        <div key={state.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`add-user-state-${state.id}`}
                            checked={selectedStateIds.includes(state.id)}
                            onCheckedChange={(checked) =>
                              toggleState(state.id, checked === true)
                            }
                          />
                          <label
                            htmlFor={`add-user-state-${state.id}`}
                            className="text-xs cursor-pointer"
                          >
                            {state.state_name}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {role === 'base_err' && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label>State</Label>
                    <Select
                      value={baseStateName || undefined}
                      onValueChange={(value) => {
                        setBaseStateName(value)
                        setErrId('')
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Select state…" />
                      </SelectTrigger>
                      <SelectContent>
                        {states.map((s) => (
                          <SelectItem key={s.id} value={s.state_name}>
                            {s.state_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>ERR</Label>
                    <Select
                      value={errId || undefined}
                      onValueChange={setErrId}
                      disabled={!baseStateName}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue
                          placeholder={
                            baseStateName ? 'Select ERR…' : 'Select a state first'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {roomsForState.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.err_code ? `${room.err_code} — ${room.name}` : room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label>User Status</Label>
                <div className="flex gap-4 pt-1">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="add-user-status"
                      checked={status === 'active'}
                      onChange={() => setStatus('active')}
                    />
                    Active
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="add-user-status"
                      checked={status === 'suspended'}
                      onChange={() => setStatus('suspended')}
                    />
                    Suspended
                  </label>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleCreate} disabled={saving || !role}>
                {saving ? 'Creating…' : 'Create User'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
