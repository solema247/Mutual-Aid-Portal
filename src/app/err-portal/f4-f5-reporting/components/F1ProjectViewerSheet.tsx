'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  fetchF1SignedUrlForProject,
  openProjectF1InNewTab,
  type ProjectOverviewPayload,
} from '@/lib/f4f5/projectF1Access'

type F1ProjectViewerSheetProps = {
  projectId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function projectDisplayTitle(data: ProjectOverviewPayload | null): string {
  if (!data?.project) return 'F1'
  const name = data.project.project_name?.trim() || data.project.project_objectives?.trim()
  if (name) {
    return name.length > 120 ? `${name.slice(0, 117)}…` : name
  }
  const serial = data.project.grant_serial_id ?? data.project.grant_id
  if (serial) return String(serial)
  return 'F1'
}

function projectDisplaySerial(data: ProjectOverviewPayload | null): string | null {
  if (!data?.project) return null
  const serial =
    data.project.grant_serial_id ?? data.project.grant_id ?? data.project.grant_call_id
  return serial ? String(serial).trim() : null
}

export default function F1ProjectViewerSheet({
  projectId,
  open,
  onOpenChange,
}: F1ProjectViewerSheetProps) {
  const { t } = useTranslation(['f4f5', 'common'])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [overview, setOverview] = useState<ProjectOverviewPayload | null>(null)
  const [openingTab, setOpeningTab] = useState(false)

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setIframeUrl(null)
    setOverview(null)
    setOpeningTab(false)
  }, [])

  useEffect(() => {
    if (!open || !projectId) {
      if (!open) reset()
      return
    }

    let cancelled = false
    reset()
    setLoading(true)

    ;(async () => {
      const result = await fetchF1SignedUrlForProject(projectId)
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
        setLoading(false)
        return
      }
      setOverview(result.overview)
      setIframeUrl(result.url)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, projectId, reset])

  const handleOpenNewTab = async () => {
    if (!projectId) return
    setOpeningTab(true)
    try {
      const result = await openProjectF1InNewTab(projectId)
      if (!result.ok) setError(result.message)
    } finally {
      setOpeningTab(false)
    }
  }

  const serial = projectDisplaySerial(overview)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="inset-0 h-full w-full max-w-none border-0 sm:max-w-none flex flex-col p-0 gap-0"
      >
        <SheetHeader className="border-b px-4 py-3 pr-12 shrink-0 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle className="text-lg truncate">
                {loading && !overview ? t('f4.f1_viewer.loading') : projectDisplayTitle(overview)}
              </SheetTitle>
              {serial && (
                <SheetDescription className="truncate">{serial}</SheetDescription>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 text-xs"
              disabled={!projectId || loading || !!error || openingTab}
              onClick={handleOpenNewTab}
            >
              {openingTab ? (
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <ExternalLink className="size-3.5 mr-1.5" />
              )}
              {t('f4.f1_viewer.open_new_tab')}
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 relative bg-muted/30">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('f4.f1_viewer.loading')}</p>
            </div>
          )}
          {!loading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-destructive max-w-md">{error}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t('common:close', { defaultValue: 'Close' })}
              </Button>
            </div>
          )}
          {!loading && !error && iframeUrl && (
            <iframe
              title={t('f4.view_f1')}
              src={iframeUrl}
              className="h-full w-full border-0 bg-background"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
