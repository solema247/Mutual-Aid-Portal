'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ActiveUserListItem } from '@/app/api/users/types/users'

type StatusConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: ActiveUserListItem | null
  /** Precomputed labels for display */
  roleLabel: string
  accessScopeLabel: string
  onConfirmed: () => void
}

export default function StatusConfirmDialog({
  open,
  onOpenChange,
  user,
  roleLabel,
  accessScopeLabel,
  onConfirmed,
}: StatusConfirmDialogProps) {
  const { t } = useTranslation(['users', 'common'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSuspend = user?.status === 'active'
  const nextStatus = isSuspend ? 'suspended' : 'active'

  useEffect(() => {
    if (!open) {
      setSaving(false)
      setError(null)
    }
  }, [open])

  const handleConfirm = async () => {
    if (!user || saving) return
    try {
      setSaving(true)
      setError(null)
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : t('common:error_updating_user')
        )
      }
      onOpenChange(false)
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common:error_updating_user'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return
        setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isSuspend
              ? t('users:suspend_user_confirm_title', { defaultValue: 'Suspend User?' })
              : t('users:activate_user_confirm_title', { defaultValue: 'Activate User?' })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2 rounded-md border bg-muted/30 px-3 py-2.5">
            <div>
              <div className="text-xs text-muted-foreground">{t('users:display_name')}</div>
              <div className="font-medium text-foreground">{user?.display_name || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">{t('users:role')}</div>
              <div className="text-foreground">{roleLabel || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                {t('users:access_scope', { defaultValue: 'Access Scope' })}
              </div>
              <div className="text-foreground">{accessScopeLabel || '—'}</div>
            </div>
          </div>

          <p className="text-muted-foreground">
            {isSuspend
              ? t('users:suspend_user_confirm_message', {
                  defaultValue:
                    'This user will no longer be able to access the portal until the account is activated again.',
                })
              : t('users:activate_user_confirm_message', {
                  defaultValue: 'This user will regain access to the portal.',
                })}
          </p>
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
          <Button
            type="button"
            variant={isSuspend ? 'secondary' : 'default'}
            disabled={saving}
            onClick={() => void handleConfirm()}
          >
            {saving
              ? t('common:saving', { defaultValue: 'Saving...' })
              : isSuspend
                ? t('users:suspend_user', { defaultValue: 'Suspend User' })
                : t('users:activate_user', { defaultValue: 'Activate User' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
