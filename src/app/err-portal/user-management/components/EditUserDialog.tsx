'use client'

import { useEffect, useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Check, Clock, Info, Lock, User as UserIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isPortalRole, rolesAssignableBy, type PortalRole } from '@/lib/userAccessRules'
import { getPortalRoleLabel } from '@/lib/roleLabels'
import type { ActiveUserListItem } from '@/app/api/users/types/users'

type EditUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: ActiveUserListItem | null
  currentUserRole: string
  currentUserId?: string
  /** Read-only access scope summary (managed in Access Rights) */
  accessScopeLabel?: string | null
  onSaved: () => void
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

export default function EditUserDialog({
  open,
  onOpenChange,
  user,
  currentUserRole,
  currentUserId,
  accessScopeLabel,
  onSaved,
}: EditUserDialogProps) {
  const { t } = useTranslation(['users', 'common'])
  const assignableRoles = useMemo(
    () => rolesAssignableBy(currentUserRole),
    [currentUserRole]
  )

  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<PortalRole | ''>('')
  const [status, setStatus] = useState<'active' | 'suspended'>('active')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string
    role?: string
  }>({})
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false)

  const isSelf = Boolean(user && currentUserId && user.id === currentUserId)
  const originalRole = user?.role
  const email = user?.email?.trim() || null
  const scopeText =
    accessScopeLabel?.trim() ||
    t('users:access_scope_managed_elsewhere', {
      defaultValue: 'Managed in Access Rights',
    })

  useEffect(() => {
    if (!open || !user) return
    setDisplayName(user.display_name || '')
    setRole(user.role)
    setStatus(user.status)
    setError(null)
    setFieldErrors({})
    setSaving(false)
    setRoleConfirmOpen(false)
  }, [open, user])

  const roleOptions = useMemo(() => {
    const set = new Set<PortalRole>(assignableRoles)
    if (user && isPortalRole(user.role)) {
      set.add(user.role)
    }
    return Array.from(set)
  }, [assignableRoles, user])

  const validate = () => {
    const next: { displayName?: string; role?: string } = {}
    if (!displayName.trim()) {
      next.displayName = t('users:display_name_required', {
        defaultValue: 'Display name is required',
      })
    }
    if (!role) {
      next.role = t('users:role_required', { defaultValue: 'Role is required' })
    }
    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (!user || saving) return
    if (!validate()) return

    const roleChanged = role !== originalRole
    if (roleChanged && !roleConfirmOpen) {
      setRoleConfirmOpen(true)
      return
    }

    try {
      setSaving(true)
      setError(null)

      const body: {
        display_name: string
        role?: PortalRole
        status?: 'active' | 'suspended'
      } = {
        display_name: displayName.trim(),
      }

      if (!isSelf) {
        body.role = role as PortalRole
        body.status = status
      }

      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : t('common:error_updating_user')
        )
      }

      if (data.role_changed && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('portal-user-role-changed', { detail: { userId: user.id } })
        )
      }

      setRoleConfirmOpen(false)
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:error_updating_user'))
      setRoleConfirmOpen(false)
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  const shortId = user.id.length > 8 ? `${user.id.slice(0, 8)}…` : user.id

  return (
    <>
      <Dialog
        open={open && !roleConfirmOpen}
        onOpenChange={(next) => {
          if (saving) return
          onOpenChange(next)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader className="space-y-1.5 text-start">
            <div className="flex flex-wrap items-center gap-2 pe-6">
              <DialogTitle className="text-xl font-semibold tracking-tight">
                {t('users:edit_user', { defaultValue: 'Edit User' })}
              </DialogTitle>
              <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                {t('users:account_settings_badge', {
                  defaultValue: 'Account Settings',
                })}
              </span>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {t('users:edit_user_subtitle', {
                defaultValue:
                  'Update personal information, manage organizational role, and modify system status.',
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Profile summary */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3 dark:border-border/40 dark:bg-muted/30">
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    avatarTone(user.display_name)
                  )}
                  aria-hidden
                >
                  {getInitials(user.display_name)}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {user.display_name || '—'}
                    </span>
                    <span className="inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      {getPortalRoleLabel(user.role, t)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <span
                        className={cn(
                          'size-1.5 rounded-full',
                          user.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'
                        )}
                        aria-hidden
                      />
                      {t(`users:${user.status}_status`)}
                    </span>
                  </div>
                  {email ? (
                    <div className="truncate text-xs text-muted-foreground">{email}</div>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 space-y-0.5 text-end text-[10px] text-muted-foreground">
                <div title={user.id}>
                  {t('users:system_uid', { defaultValue: 'System UID' })} {shortId}
                </div>
                {user.createdAt ? (
                  <div>
                    {t('users:created_on', {
                      defaultValue: 'Created on {{date}}',
                      date: user.createdAt,
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-display-name" className="text-xs font-medium">
                {t('users:display_name')}
                <span className="ms-0.5 text-destructive" aria-hidden>
                  *
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="edit-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
              {fieldErrors.displayName && (
                <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
              )}
            </div>

            {/* Email — read only */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-email" className="text-xs font-medium">
                {t('users:email_address', { defaultValue: 'Email Address' })}
              </Label>
              <div className="relative">
                <Input
                  id="edit-email"
                  value={email || t('users:email_unavailable', { defaultValue: 'No email on file' })}
                  readOnly
                  disabled
                  className="h-10 rounded-md border-slate-200 bg-slate-50 pe-24 text-muted-foreground opacity-100 dark:bg-muted/40"
                />
                <span className="pointer-events-none absolute end-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden />
                  {t('users:read_only', { defaultValue: 'Read only' })}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('users:email_readonly_hint', {
                  defaultValue:
                    'Email address is managed through authentication and cannot be changed here.',
                })}
              </p>
            </div>

            {/* Role + Access scope */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t('users:role')}</Label>
                <Select
                  value={role || undefined}
                  onValueChange={(v) => setRole(v as PortalRole)}
                  disabled={saving || isSelf}
                >
                  <SelectTrigger className="h-10 rounded-md">
                    <SelectValue placeholder={t('users:role')} />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r} value={r}>
                        {getPortalRoleLabel(r, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {isSelf
                    ? t('users:cannot_edit_own_role', {
                        defaultValue: 'You cannot change your own role.',
                      })
                    : t('users:role_field_hint', {
                        defaultValue: 'Organizational role and permission pack.',
                      })}
                </p>
                {fieldErrors.role && (
                  <p className="text-xs text-destructive">{fieldErrors.role}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {t('users:access_scope', { defaultValue: 'Access Scope' })}
                </Label>
                <div className="relative">
                  <Input
                    value={scopeText}
                    readOnly
                    disabled
                    className="h-10 rounded-md border-slate-200 bg-slate-50 pe-20 text-muted-foreground opacity-100 dark:bg-muted/40"
                    title={scopeText}
                  />
                  <span className="pointer-events-none absolute end-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    <Lock className="size-3.5" aria-hidden />
                    {t('users:read_only', { defaultValue: 'Read only' })}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t('users:access_scope_edit_hint', {
                    defaultValue: 'Change scope from Access Rights.',
                  })}
                </p>
              </div>
            </div>

            {/* Account status */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-medium">
                  {t('users:account_status', { defaultValue: 'Account Status' })}
                </Label>
                <Info className="size-3.5 text-muted-foreground" aria-hidden />
              </div>
              <div
                className={cn(
                  'grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-1 dark:border-border/40 dark:bg-muted/20',
                  isSelf && 'pointer-events-none opacity-70'
                )}
                role="radiogroup"
                aria-label={t('users:account_status', { defaultValue: 'Account Status' })}
              >
                {(
                  [
                    {
                      value: 'active' as const,
                      label: t('users:active_status'),
                      activeClass: 'border-emerald-300 bg-white text-emerald-800 shadow-sm',
                      dotClass: 'bg-emerald-500',
                    },
                    {
                      value: 'suspended' as const,
                      label: t('users:suspended_status'),
                      activeClass: 'border-amber-300 bg-white text-amber-900 shadow-sm',
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
                      disabled={saving || isSelf}
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
              {isSelf && (
                <p className="text-[11px] text-muted-foreground">
                  {t('users:cannot_edit_own_status', {
                    defaultValue: 'You cannot change your own status.',
                  })}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-[11px] text-muted-foreground dark:border-border/40">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 shrink-0" aria-hidden />
                  {user.updatedAt
                    ? t('users:last_updated_on', {
                        defaultValue: 'Last updated: {{date}}',
                        date: user.updatedAt,
                      })
                    : t('users:last_updated_unknown', {
                        defaultValue: 'Last updated: —',
                      })}
                </span>
                {user.createdAt ? (
                  <span>
                    {t('users:created_on', {
                      defaultValue: 'Created on {{date}}',
                      date: user.createdAt,
                    })}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={saving || isSelf || status === 'suspended'}
              className="h-9 px-0 text-destructive hover:bg-transparent hover:text-destructive/90 sm:justify-start"
              onClick={() => setStatus('suspended')}
            >
              {t('users:deactivate_user', { defaultValue: 'Deactivate User' })}
            </Button>
            <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                className="h-9 rounded-md"
                onClick={() => onOpenChange(false)}
              >
                {t('common:cancel', { defaultValue: 'Cancel' })}
              </Button>
              <Button
                type="button"
                disabled={saving}
                className="h-9 rounded-md bg-orange-500 text-white hover:bg-orange-600"
                onClick={() => void submit()}
              >
                <Check className="size-4" aria-hidden />
                {saving
                  ? t('common:saving', { defaultValue: 'Saving...' })
                  : t('users:save_changes', { defaultValue: 'Save Changes' })}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={roleConfirmOpen}
        onOpenChange={(next) => {
          if (saving) return
          setRoleConfirmOpen(next)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('users:role_change_confirm_title', {
                defaultValue: 'Confirm role change',
              })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('users:role_change_warning', {
              defaultValue:
                "Changing this user's role may change their permissions and access scope. Existing custom permission overrides will be reset.",
            })}
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setRoleConfirmOpen(false)}
            >
              {t('common:cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving
                ? t('common:saving', { defaultValue: 'Saving...' })
                : t('users:continue', { defaultValue: 'Continue' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
