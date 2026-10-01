'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Check, Copy, Info, Mail, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import { rolesAssignableBy, type PortalRole } from '@/lib/userAccessRules'
import { getPortalRoleLabel } from '@/lib/roleLabels'

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

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function avatarTone(name: string | null | undefined): string {
  const tones = [
    'bg-violet-100 text-violet-700',
    'bg-sky-100 text-sky-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
  ]
  const key = (name || '?').trim()
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash + key.charCodeAt(i) * (i + 1)) % tones.length
  }
  return tones[hash]
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
        const res = await fetch('/api/ops-partners', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to fetch ops partners')
        const data = await res.json()
        setPartners(
          ((data || []) as PartnerOption[]).map((p) => ({ id: p.id, name: p.name }))
        )
      } catch (e) {
        console.error('Failed to load ops partners', e)
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

  const previewName = displayName.trim() || [firstName, secondName].filter(Boolean).join(' ').trim()

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
      setError(t('users:role_required', { defaultValue: 'Role is required' }))
      return
    }
    if (!email.trim() || !displayName.trim()) {
      setError(
        t('users:email_and_display_required', {
          defaultValue: 'Email and display name are required',
        })
      )
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
        setError(
          t('users:partner_org_required', {
            defaultValue: 'Ops partner is required',
          })
        )
        return
      }
      body.ops_partner_id = partnerId
    } else if (role === 'state_err') {
      body.can_see_all_states = canSeeAllStates
      body.visible_states = canSeeAllStates ? [] : selectedStateIds
      if (!canSeeAllStates && selectedStateIds.length === 0) {
        setError(
          t('users:select_states_or_all', {
            defaultValue: 'Select at least one state, or enable All States',
          })
        )
        return
      }
    } else if (role === 'base_err') {
      if (!errId) {
        setError(
          t('users:err_required_for_base_err', {
            defaultValue: 'ERR is required for Base ERR',
          })
        )
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
      setError(t('users:copy_password_failed', { defaultValue: 'Failed to copy password' }))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto text-sm sm:max-w-xl">
        {createdPassword ? (
          <>
            <DialogHeader className="space-y-1.5 text-start">
              <div className="flex flex-wrap items-center gap-2 pe-6">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {t('users:user_created_title', { defaultValue: 'User created' })}
                </DialogTitle>
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {t('users:success_badge', { defaultValue: 'Success' })}
                </span>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {t('users:user_created_subtitle', {
                  defaultValue:
                    'Copy the temporary password now. It will not be shown again.',
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-1">
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-border/40 dark:bg-muted/30">
                <p className="text-sm">
                  {t('users:account_created_for', {
                    defaultValue: 'Account for {{name}} was created successfully.',
                    name: createdName || '—',
                  })}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t('users:temporary_password', { defaultValue: 'Temporary password' })}
                </Label>
                <div className="rounded-md border border-slate-200 bg-muted/40 px-3 py-2.5 font-mono text-xs break-all">
                  {createdPassword}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('users:password_change_hint', {
                    defaultValue: 'The user must change it after first login.',
                  })}
                </p>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-md"
                onClick={copyPassword}
              >
                <Copy className="size-4" aria-hidden />
                {copied
                  ? t('users:copied', { defaultValue: 'Copied' })
                  : t('users:copy_password', { defaultValue: 'Copy Password' })}
              </Button>
              <Button
                type="button"
                className="h-9 rounded-md bg-orange-500 text-white hover:bg-orange-600"
                onClick={() => handleClose(false)}
              >
                <Check className="size-4" aria-hidden />
                {t('users:done', { defaultValue: 'Done' })}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="space-y-1.5 text-start">
              <div className="flex flex-wrap items-center gap-2 pe-6">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  {t('users:add_user', { defaultValue: 'Add User' })}
                </DialogTitle>
                <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                  {t('users:account_settings_badge', {
                    defaultValue: 'Account Settings',
                  })}
                </span>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                {t('users:add_user_subtitle', {
                  defaultValue:
                    'Create a portal account, assign an organizational role, and set initial access scope.',
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-1">
              {error && (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}

              {/* Live preview */}
              <div className="flex flex-wrap items-start gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-border/40 dark:bg-muted/30">
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    avatarTone(previewName || '?')
                  )}
                  aria-hidden
                >
                  {getInitials(previewName || null)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {previewName ||
                        t('users:new_user_preview', { defaultValue: 'New user' })}
                    </span>
                    {role ? (
                      <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {getPortalRoleLabel(role, t)}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                        )}
                        aria-hidden
                      />
                      {t(`users:${status}_status`)}
                    </span>
                  </div>
                  {email.trim() ? (
                    <div className="truncate text-xs text-muted-foreground">{email.trim()}</div>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      {t('users:email_preview_placeholder', {
                        defaultValue: 'Email will appear here',
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Names */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="add-user-first" className="text-xs font-medium">
                    {t('users:first_name', { defaultValue: 'First Name' })}
                  </Label>
                  <Input
                    id="add-user-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={saving}
                    className="h-10 rounded-md"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="add-user-second" className="text-xs font-medium">
                    {t('users:second_name', { defaultValue: 'Second Name' })}
                  </Label>
                  <Input
                    id="add-user-second"
                    value={secondName}
                    onChange={(e) => setSecondName(e.target.value)}
                    disabled={saving}
                    className="h-10 rounded-md"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="add-user-display" className="text-xs font-medium">
                  {t('users:display_name')}
                  <span className="ms-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="add-user-display"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayNameTouched(true)
                      setDisplayName(e.target.value)
                    }}
                    disabled={saving}
                    className="h-10 rounded-md pe-9"
                  />
                  <UserIcon
                    className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('users:display_name_hint', {
                    defaultValue:
                      'Visible to team members and external stakeholders in mission reports.',
                  })}
                </p>
              </div>

              {/* Email — editable on create */}
              <div className="space-y-1.5">
                <Label htmlFor="add-user-email" className="text-xs font-medium">
                  {t('users:email_address', { defaultValue: 'Email Address' })}
                  <span className="ms-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="add-user-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={saving}
                    autoComplete="off"
                    className="h-10 rounded-md pe-9"
                  />
                  <Mail
                    className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('users:email_create_hint', {
                    defaultValue:
                      'Used to create the authentication account. It cannot be changed later from Edit User.',
                  })}
                </p>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t('users:role')}
                  <span className="ms-0.5 text-destructive" aria-hidden>
                    *
                  </span>
                </Label>
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
                  disabled={saving}
                >
                  <SelectTrigger className="h-10 rounded-md">
                    <SelectValue
                      placeholder={t('users:select_role', {
                        defaultValue: 'Select role…',
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {getPortalRoleLabel(r, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {t('users:role_field_hint', {
                    defaultValue: 'Organizational role and permission pack.',
                  })}
                </p>
              </div>

              {/* Access scope by role */}
              {role === 'partner' && (
                <div className="space-y-1.5 rounded-lg border border-slate-100 p-3 dark:border-border/40">
                  <Label className="text-xs font-medium">
                    {t('users:partner_organization', {
                      defaultValue: 'Ops partner',
                    })}
                    <span className="ms-0.5 text-destructive" aria-hidden>
                      *
                    </span>
                  </Label>
                  <Select
                    value={partnerId || undefined}
                    onValueChange={setPartnerId}
                    disabled={saving}
                  >
                    <SelectTrigger className="h-10 rounded-md">
                      <SelectValue
                        placeholder={t('users:select_partner', {
                          defaultValue: 'Select ops partner…',
                        })}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t('users:partner_scope_hint', {
                      defaultValue: 'Partner users are grant-scoped via ops_partners.',
                    })}
                  </p>
                </div>
              )}

              {role === 'state_err' && (
                <div className="space-y-2 rounded-lg border border-slate-100 p-3 dark:border-border/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-xs font-medium">
                      {t('users:state_access', { defaultValue: 'State Access' })}
                    </Label>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-md px-2 text-xs"
                        disabled={saving}
                        onClick={() => {
                          setCanSeeAllStates(false)
                          setSelectedStateIds(states.map((s) => s.id))
                        }}
                      >
                        {t('common:select_all', { defaultValue: 'Select All' })}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-md px-2 text-xs"
                        disabled={saving}
                        onClick={() => {
                          setCanSeeAllStates(false)
                          setSelectedStateIds([])
                        }}
                      >
                        {t('common:clear_all', { defaultValue: 'Clear All' })}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="add-user-all-states"
                      checked={canSeeAllStates}
                      disabled={saving}
                      onCheckedChange={(checked) => {
                        const on = checked === true
                        setCanSeeAllStates(on)
                        if (on) setSelectedStateIds([])
                      }}
                    />
                    <label
                      htmlFor="add-user-all-states"
                      className="cursor-pointer text-xs"
                    >
                      {t('users:can_see_all_states', {
                        defaultValue: 'Can see all states',
                      })}
                    </label>
                  </div>
                  {!canSeeAllStates && (
                    <div className="max-h-40 space-y-1 overflow-y-auto border-t border-slate-100 pt-2 dark:border-border/40">
                      {states.map((state) => (
                        <div key={state.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`add-user-state-${state.id}`}
                            checked={selectedStateIds.includes(state.id)}
                            disabled={saving}
                            onCheckedChange={(checked) =>
                              toggleState(state.id, checked === true)
                            }
                          />
                          <label
                            htmlFor={`add-user-state-${state.id}`}
                            className="cursor-pointer text-xs"
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
                <div className="grid gap-3 rounded-lg border border-slate-100 p-3 sm:grid-cols-2 dark:border-border/40">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">{t('users:state')}</Label>
                    <Select
                      value={baseStateName || undefined}
                      onValueChange={(value) => {
                        setBaseStateName(value)
                        setErrId('')
                      }}
                      disabled={saving}
                    >
                      <SelectTrigger className="h-10 rounded-md">
                        <SelectValue
                          placeholder={t('users:select_state', {
                            defaultValue: 'Select state…',
                          })}
                        />
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
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      {getPortalRoleLabel('base_err', t)}
                      <span className="ms-0.5 text-destructive" aria-hidden>
                        *
                      </span>
                    </Label>
                    <Select
                      value={errId || undefined}
                      onValueChange={setErrId}
                      disabled={saving || !baseStateName}
                    >
                      <SelectTrigger className="h-10 rounded-md">
                        <SelectValue
                          placeholder={
                            baseStateName
                              ? t('users:select_err_room', {
                                  defaultValue: 'Select room…',
                                })
                              : t('users:select_state_first', {
                                  defaultValue: 'Select a state first',
                                })
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {roomsForState.map((room) => (
                          <SelectItem key={room.id} value={room.id}>
                            {room.err_code
                              ? `${room.err_code} — ${room.name}`
                              : room.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-muted-foreground sm:col-span-2">
                    {t('users:base_err_scope_hint', {
                      defaultValue:
                        'Base ERR users are scoped to a single emergency room.',
                    })}
                  </p>
                </div>
              )}

              {/* Account status */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-xs font-medium">
                    {t('users:account_status', { defaultValue: 'Account Status' })}
                  </Label>
                  <Info className="size-3.5 text-muted-foreground" aria-hidden />
                </div>
                <div
                  className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-1 dark:border-border/40 dark:bg-muted/20"
                  role="radiogroup"
                  aria-label={t('users:account_status', {
                    defaultValue: 'Account Status',
                  })}
                >
                  {(
                    [
                      {
                        value: 'active' as const,
                        label: t('users:active_status'),
                        activeClass:
                          'border-emerald-300 bg-white text-emerald-800 shadow-sm',
                        dotClass: 'bg-emerald-500',
                      },
                      {
                        value: 'suspended' as const,
                        label: t('users:suspended_status'),
                        activeClass:
                          'border-amber-300 bg-white text-amber-900 shadow-sm',
                        dotClass: 'bg-amber-500',
                      },
                    ] as const
                  ).map((opt) => {
                    const selected = status === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={saving}
                        onClick={() => setStatus(opt.value)}
                        className={cn(
                          'inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-medium transition-colors',
                          selected
                            ? opt.activeClass
                            : 'text-muted-foreground hover:bg-white/80 dark:hover:bg-background/50'
                        )}
                      >
                        <span
                          className={cn('size-1.5 rounded-full', opt.dotClass)}
                          aria-hidden
                        />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-md"
                onClick={() => handleClose(false)}
                disabled={saving}
              >
                {t('common:cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                type="button"
                className="h-9 rounded-md bg-orange-500 text-white hover:bg-orange-600"
                onClick={() => void handleCreate()}
                disabled={saving || !role}
              >
                <Check className="size-4" aria-hidden />
                {saving
                  ? t('users:creating', { defaultValue: 'Creating…' })
                  : t('users:create_user', { defaultValue: 'Create User' })}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
