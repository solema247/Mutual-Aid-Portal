'use client'

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from 'react'
import { Check, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react'
import { scaleSelectionForDisplay } from '../wizard/scaleSelectionForDisplay'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { normalizeWizardPage, type WizardPageEntry } from '../f4Wizard/types'

export type WizardStepPill = {
  id: string
  label: string
  completed: boolean
  isCurrent: boolean
}

export type WizardDragOverlay = {
  pageIndex: number
  sx: number
  sy: number
  cx: number
  cy: number
} | null

export type WizardRegionSelection = {
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.5
const ZOOM_STEP = 0.25

function clampZoom (z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100))
}

function pageImageStyle (
  page: WizardPageEntry,
  zoom: number,
  fitToContainer: boolean
): React.CSSProperties {
  const w = page.displayWidth ? Math.round(page.displayWidth * zoom) : undefined
  return {
    width: w ? `${w}px` : undefined,
    maxWidth: fitToContainer ? '100%' : 'none',
    height: 'auto',
  }
}

type WizardViewerZoomBarProps = {
  zoom: number
  onZoomChange: (zoom: number) => void
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  disabled?: boolean
}

function WizardViewerZoomBar ({
  zoom,
  onZoomChange,
  expanded,
  onExpandedChange,
  disabled,
}: WizardViewerZoomBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 shrink-0">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0"
        title="Zoom out"
        disabled={disabled || zoom <= ZOOM_MIN}
        onClick={() => onZoomChange(clampZoom(zoom - ZOOM_STEP))}
      >
        <ZoomOut className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Zoom out</span>
      </Button>
      <span className="text-[11px] tabular-nums text-muted-foreground min-w-[3rem] text-center">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-7 p-0"
        title="Zoom in"
        disabled={disabled || zoom >= ZOOM_MAX}
        onClick={() => onZoomChange(clampZoom(zoom + ZOOM_STEP))}
      >
        <ZoomIn className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">Zoom in</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-[11px] gap-1"
        disabled={disabled}
        onClick={() => onExpandedChange(!expanded)}
      >
        {expanded ? (
          <>
            <Minimize2 className="h-3.5 w-3.5" aria-hidden />
            Exit full screen
          </>
        ) : (
          <>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            Full screen
          </>
        )}
      </Button>
    </div>
  )
}

type WizardPageCanvasProps = {
  pageIndex: number
  page: WizardPageEntry
  pageShellClass: string
  fitToContainer: boolean
  zoom: number
  selections: WizardRegionSelection[]
  dragging: WizardDragOverlay | null
  startDragOnPage: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void
  setWrapRef: (el: HTMLDivElement | null) => void
}

/** One PDF/image page: tracks live display size so selection boxes stay aligned when zoom changes. */
function WizardPageCanvas ({
  pageIndex,
  page,
  pageShellClass,
  fitToContainer,
  zoom,
  selections,
  dragging,
  startDragOnPage,
  setWrapRef,
}: WizardPageCanvasProps) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const update = () => {
      setDisplaySize({ w: img.clientWidth, h: img.clientHeight })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(img)
    return () => ro.disconnect()
  }, [page.dataUrl, zoom, fitToContainer, page.displayWidth, page.displayHeight])

  const { w: displayW, h: displayH } = displaySize

  return (
    <div className={pageShellClass}>
      <div
        ref={setWrapRef}
        className={cn(
          'relative inline-block select-none touch-none',
          fitToContainer && 'max-w-full'
        )}
        onMouseDown={(e) => startDragOnPage(pageIndex, e)}
      >
        <img
          ref={imgRef}
          src={page.dataUrl}
          alt={`Page ${pageIndex + 1}`}
          width={page.displayWidth || undefined}
          height={page.displayHeight || undefined}
          className={cn(
            'block h-auto w-auto select-none pointer-events-none',
            fitToContainer ? 'max-w-full' : 'max-w-none'
          )}
          style={pageImageStyle(page, zoom, fitToContainer)}
          onLoad={() => {
            const img = imgRef.current
            if (img) setDisplaySize({ w: img.clientWidth, h: img.clientHeight })
          }}
        />
        {selections.map((s, idx) => {
          const box = scaleSelectionForDisplay(s, displayW, displayH)
          return (
            <div
              key={`sel-${pageIndex}-${idx}`}
              className="absolute border-2 border-sky-500 bg-sky-300/15 pointer-events-none"
              style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
            />
          )
        })}
        {dragging && dragging.pageIndex === pageIndex && (
          <div
            className="absolute border-2 border-orange-500 bg-orange-300/20 pointer-events-none"
            style={{
              left: Math.min(dragging.sx, dragging.cx),
              top: Math.min(dragging.sy, dragging.cy),
              width: Math.abs(dragging.cx - dragging.sx),
              height: Math.abs(dragging.cy - dragging.sy),
            }}
          />
        )}
        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded pointer-events-none">
          Page {pageIndex + 1}
        </div>
      </div>
    </div>
  )
}

type WizardDocumentPagesProps = {
  viewerMode: 'pdf' | 'image' | 'unsupported'
  isRenderingPages: boolean
  wizardPages: WizardPageEntry[]
  currentSelections: WizardRegionSelection[]
  dragging: WizardDragOverlay
  startDragOnPage: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void
  wizardPageWrapRefs: MutableRefObject<(HTMLDivElement | null)[]>
  zoom: number
  fitToContainer: boolean
  loadingMinHeight: string
  emptyMinHeight: string
  pagesLayoutClass: string
  pageShellClass: string
}

function WizardDocumentPages ({
  viewerMode,
  isRenderingPages,
  wizardPages,
  currentSelections,
  dragging,
  startDragOnPage,
  wizardPageWrapRefs,
  zoom,
  fitToContainer,
  loadingMinHeight,
  emptyMinHeight,
  pagesLayoutClass,
  pageShellClass,
}: WizardDocumentPagesProps) {
  if (isRenderingPages) {
    return (
      <div
        className={cn(
          'w-full border rounded flex items-center justify-center text-muted-foreground text-sm',
          loadingMinHeight
        )}
      >
        Rendering document pages…
      </div>
    )
  }
  if (wizardPages.length === 0) {
    return (
      <div
        className={cn(
          'w-full border rounded flex items-center justify-center text-muted-foreground text-sm',
          emptyMinHeight
        )}
      >
        {viewerMode === 'unsupported'
          ? 'No renderable pages — use PDF or image files for guided extraction.'
          : 'No renderable pages available'}
      </div>
    )
  }
  return (
    <div className={pagesLayoutClass}>
      {wizardPages.map((raw, pageIndex) => {
        const page = normalizeWizardPage(raw)
        if (!page?.dataUrl) return null
        const keySuffix = page.dataUrl.length > 32 ? page.dataUrl.slice(0, 32) : page.dataUrl
        return (
          <WizardPageCanvas
            key={`${pageIndex}-${keySuffix}`}
            pageIndex={pageIndex}
            page={page}
            pageShellClass={pageShellClass}
            fitToContainer={fitToContainer}
            zoom={zoom}
            selections={currentSelections.filter((s) => s.pageIndex === pageIndex)}
            dragging={dragging}
            startDragOnPage={startDragOnPage}
            setWrapRef={(el) => {
              wizardPageWrapRefs.current[pageIndex] = el
            }}
          />
        )
      })}
    </div>
  )
}

export type WizardFullscreenShellProps = {
  title: string
  steps: WizardStepPill[]
  expectedStepId: string
  selectionCount: number
  wizardLoading: boolean
  processDisabled: boolean
  clearDisabled: boolean
  onProcess: () => void
  onClearSelections: () => void
  toolbarExtra?: ReactNode

  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  zoom: number
  onZoomChange: (zoom: number) => void

  viewerMode: 'pdf' | 'image' | 'unsupported'
  isRenderingPages: boolean
  wizardPages: WizardPageEntry[]
  currentSelections: WizardRegionSelection[]
  dragging: WizardDragOverlay
  startDragOnPage: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void
  wizardViewerScrollRef: RefObject<HTMLDivElement | null>
  wizardPageWrapRefs: MutableRefObject<(HTMLDivElement | null)[]>

  unsupportedBanner?: ReactNode

  onBack: () => void
  onContinue: () => void
  backDisabled?: boolean
  continueDisabled?: boolean
  continueLabel?: string
  backLabel?: string
}

/** Guided extraction step: compact modal viewer by default, optional full screen + zoom. */
export function WizardFullscreenShell ({
  title,
  steps,
  expectedStepId,
  selectionCount,
  wizardLoading,
  processDisabled,
  clearDisabled,
  onProcess,
  onClearSelections,
  toolbarExtra,
  expanded,
  onExpandedChange,
  zoom,
  onZoomChange,
  viewerMode,
  isRenderingPages,
  wizardPages,
  currentSelections,
  dragging,
  startDragOnPage,
  wizardViewerScrollRef,
  wizardPageWrapRefs,
  unsupportedBanner,
  onBack,
  onContinue,
  backDisabled,
  continueDisabled,
  continueLabel = 'Continue to review form',
  backLabel = 'Back',
}: WizardFullscreenShellProps) {
  const fitToContainer = !expanded && zoom <= 1

  const toolbar = (
    <div
      className={cn(
        'shrink-0 rounded-md border bg-background/95 px-2 py-1.5 shadow-sm',
        !expanded && 'sticky top-0 z-30 supports-[backdrop-filter]:backdrop-blur-sm'
      )}
    >
      <p
        className={cn(
          'text-[11px] leading-snug text-muted-foreground pb-1.5 border-b border-border/70 mb-1.5',
          expanded && 'hidden sm:block'
        )}
      >
        Highlight a section on the document viewer, then run extraction for this step. Use zoom or full screen
        for small text.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {steps.map((step) => (
            <span
              key={step.id}
              className={cn(
                'inline-flex h-7 items-center gap-0.5 rounded border px-1.5 text-[11px] leading-none',
                step.completed
                  ? 'bg-green-50 border-green-300 text-green-800'
                  : step.isCurrent
                    ? 'bg-sky-50 border-sky-300 text-sky-800'
                    : 'bg-muted/30 text-muted-foreground'
              )}
            >
              {step.label}
              {step.completed && (
                <Check className="h-3.5 w-3.5 shrink-0 text-green-700" strokeWidth={2.5} aria-hidden />
              )}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          · Step <strong className="font-semibold text-foreground">{expectedStepId}</strong> · {selectionCount}{' '}
          selection(s)
        </span>
        <div className="flex-1 min-w-[8px] hidden sm:block" aria-hidden />
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={onProcess}
            disabled={wizardLoading || processDisabled}
          >
            {wizardLoading ? 'Processing…' : `Process ${expectedStepId}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={onClearSelections}
            disabled={wizardLoading || clearDisabled}
          >
            Clear current step selections
          </Button>
          {toolbarExtra}
        </div>
      </div>
    </div>
  )

  const viewerChrome = (
    <WizardViewerZoomBar
      zoom={zoom}
      onZoomChange={onZoomChange}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      disabled={wizardLoading}
    />
  )

  const pages = (
    <WizardDocumentPages
      viewerMode={viewerMode}
      isRenderingPages={isRenderingPages}
      wizardPages={wizardPages}
      currentSelections={currentSelections}
      dragging={dragging}
      startDragOnPage={startDragOnPage}
      wizardPageWrapRefs={wizardPageWrapRefs}
      zoom={zoom}
      fitToContainer={fitToContainer}
      loadingMinHeight={expanded ? 'min-h-[50vh]' : 'min-h-[280px]'}
      emptyMinHeight={expanded ? 'min-h-[40vh]' : 'h-[400px]'}
      pagesLayoutClass={cn(
        'pb-2',
        expanded ? 'mx-auto flex w-max max-w-none flex-col gap-6' : 'space-y-4'
      )}
      pageShellClass={cn(
        'border rounded overflow-hidden bg-white',
        expanded && 'shadow-sm',
        !expanded && 'mx-auto w-fit max-w-full'
      )}
    />
  )

  const footer = (
    <div className={cn('shrink-0 flex justify-between gap-2', expanded ? 'border-t border-border/80 pt-2' : 'border-t pt-3')}>
      <Button variant="outline" onClick={onBack} disabled={backDisabled || wizardLoading}>
        {backLabel}
      </Button>
      <Button onClick={onContinue} disabled={continueDisabled || wizardLoading}>
        {continueLabel}
      </Button>
    </div>
  )

  if (expanded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/80 pb-2">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
        </div>
        {toolbar}
        {unsupportedBanner}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-muted/20">
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b bg-background/90 px-3 py-1.5">
            <span className="text-sm font-medium">Document viewer — drag to select regions</span>
            {viewerChrome}
          </div>
          <div ref={wizardViewerScrollRef} className="min-h-0 flex-1 overflow-auto p-3 sm:p-4">
            {pages}
          </div>
        </div>
        {footer}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 min-h-0 max-h-[82vh]">
      {toolbar}
      {unsupportedBanner}
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden border">
        <CardHeader className="shrink-0 flex flex-row items-center justify-between gap-2 space-y-0 py-2 pb-1.5">
          <CardTitle className="text-sm font-semibold">Document viewer — drag to select regions</CardTitle>
          {viewerChrome}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0 px-6 pb-6 pt-0">
          <div ref={wizardViewerScrollRef} className="min-h-0 flex-1 overflow-auto pr-1">
            {pages}
          </div>
        </CardContent>
      </Card>
      {footer}
    </div>
  )
}

/** DialogContent classes when the upload wizard is expanded to full screen. */
export const WIZARD_FULLSCREEN_DIALOG_CLASS =
  'fixed inset-0 z-50 flex h-[100dvh] min-h-0 w-screen max-h-none max-w-none translate-x-0 translate-y-0 left-0 top-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-3 sm:p-4 select-text'
