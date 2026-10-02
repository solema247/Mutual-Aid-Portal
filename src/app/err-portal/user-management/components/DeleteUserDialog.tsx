'use client'

import { useState } from 'react'
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

type DeleteUserDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: ActiveUserListItem | null
  onDeleted: () => void
}

export default function DeleteUserDialog({
  open,
  onOpenChange,
  user,
  onDeleted,
}: DeleteUserDialogProps) {
  const { t } = useTranslation(['users', 'common'])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!user || saving) return
    try {
      setSaving(true)
      setError(null)
      const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : t('common:error_updating_user')
        )
      }
      onOpenChange(false)
      onDeleted()
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
            {t('users:delete_user_confirm_title', { defaultValue: 'Delete User?' })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
              {error}
            </div>
          )}
          <p>
            {t('users:delete_user_about', {
              defaultValue: 'You are about to delete:',
            })}
          </p>
          <p className="font-medium text-foreground">
            {user?.display_name || '—'}
          </p>
          <p className="text-muted-foreground">
            {t('users:delete_user_irreversible', {
              defaultValue: 'This action cannot be undone.',
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('users:delete_user_soft_note', {
              defaultValue:
                'The account will be deactivated and login removed. Historical records that reference this user are preserved.',
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
            variant="destructive"
            disabled={saving}
            onClick={() => void handleDelete()}
          >
            {saving
              ? t('common:saving', { defaultValue: 'Saving...' })
              : t('users:delete_user', { defaultValue: 'Delete User' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
