'use client'

import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Loader2, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { openCommunityApprovalFile, uploadCommunityApprovalFile } from '../approvalUpload'

const ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

type CommunityApprovalCellProps = {
  projectId: string
  approvalFileKey?: string | null
  canUpload: boolean
  onUploaded: () => Promise<void> | void
  buttonVariant?: 'outline' | 'ghost'
}

export default function CommunityApprovalCell({
  projectId,
  approvalFileKey,
  canUpload,
  onUploaded,
  buttonVariant = 'outline',
}: CommunityApprovalCellProps) {
  const { t } = useTranslation(['f2', 'common'])
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'view' | 'upload' | null>(null)

  const handleFile = async (file: File) => {
    setBusy('upload')
    try {
      const { error } = await uploadCommunityApprovalFile(projectId, file, approvalFileKey)
      if (error) {
        console.error('Upload error', error)
        alert(t('f2:upload_failed'))
        return
      }
      await onUploaded()
    } catch (err) {
      console.error('Upload error', err)
      alert(t('f2:upload_failed'))
    } finally {
      setBusy(null)
    }
  }

  const handleView = async () => {
    if (!approvalFileKey) return
    setBusy('view')
    try {
      await openCommunityApprovalFile(approvalFileKey)
    } catch (err) {
      console.error('Open file error', err)
      alert(t('f2:open_file_failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPT}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) await handleFile(file)
        }}
      />
      {approvalFileKey ? (
        <>
          <Button
            size="sm"
            variant={buttonVariant}
            className="h-7 w-7 p-0"
            disabled={busy !== null}
            onClick={handleView}
            title={t('f2:view_approval') as string}
          >
            {busy === 'view' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
          </Button>
          {canUpload && (
            <Button
              size="sm"
              variant={buttonVariant}
              className="h-7 w-7 p-0"
              disabled={busy !== null}
              onClick={() => inputRef.current?.click()}
              title={(busy === 'upload' ? t('f2:uploading') : t('f2:change_file')) as string}
            >
              {busy === 'upload' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
        </>
      ) : canUpload ? (
        <>
          <Badge variant="secondary" className="text-muted-foreground text-[10px] px-1.5 py-0">
            {t('f2:approval_required')}
          </Badge>
          <Button
            size="sm"
            variant={buttonVariant}
            className="h-7 w-7 p-0"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
            title={(busy === 'upload' ? t('f2:uploading') : t('f2:upload')) as string}
          >
            {busy === 'upload' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
          </Button>
        </>
      ) : (
        <Badge variant="secondary" className="text-muted-foreground text-[10px] px-1.5 py-0">
          {t('f2:approval_required')}
        </Badge>
      )}
    </div>
  )
}
