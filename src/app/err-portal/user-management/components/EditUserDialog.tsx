'use client'

import { useEffect, useMemo, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { rolesAssignableBy, type PortalRole } from '@/lib/userAccessRules'
import type { ActiveUserListItem } from '@/app/api/users/types/users'

type EditUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: ActiveUserListItem | null
  currentUserRole: string
  currentUserId?: string
  onSaved: () => void
}

const ROLE_LABELS: Record<PortalRole, string> = {
  support: 'Support',
  superadmin: 'Super Admin',
  admin: 'Admin',
  state_err: 'State ERR',
  base_err: 'Base ERR',
  partner: 'Partner',
}

export default function EditUserDialog({
  open,
  onOpenChange,
  user,
  currentUserRole,
  currentUserId,
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
    if (user && isPortalRoleValue(user.role)) {
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

  return (
    <>
      <Dialog
        open={open && !roleConfirmOpen}
        onOpenChange={(next) => {
          if (saving) return
          onOpenChange(next)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('users:edit_user', { defaultValue: 'Edit User' })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-display-name">{t('users:display_name')}</Label>
              <Input
                id="edit-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={saving}
                className="h-9"
              />
              {fieldErrors.displayName && (
                <p className="text-xs text-destructive">{fieldErrors.displayName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('users:role')}</Label>
              <Select
                value={role || undefined}
                onValueChange={(v) => setRole(v as PortalRole)}
                disabled={saving || isSelf}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t('users:role')} />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-muted-foreground">
                  {t('users:cannot_edit_own_role', {
                    defaultValue: 'You cannot change your own role.',
                  })}
                </p>
              )}
              {fieldErrors.role && (
                <p className="text-xs text-destructive">{fieldErrors.role}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('users:status')}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as 'active' | 'suspended')}
                disabled={saving || isSelf}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('users:active_status')}</SelectItem>
                  <SelectItem value="suspended">{t('users:suspended_status')}</SelectItem>
                </SelectContent>
              </Select>
              {isSelf && (
                <p className="text-xs text-muted-foreground">
                  {t('users:cannot_edit_own_status', {
                    defaultValue: 'You cannot change your own status.',
                  })}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t('common:cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submit()}>
              {saving
                ? t('common:saving', { defaultValue: 'Saving...' })
                : t('users:save_changes', { defaultValue: 'Save Changes' })}
            </Button>
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

function isPortalRoleValue(role: string): role is PortalRole {
  return role in ROLE_LABELS
}
