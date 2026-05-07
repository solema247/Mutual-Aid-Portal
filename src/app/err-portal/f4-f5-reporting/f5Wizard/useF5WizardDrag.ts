import { useEffect, useRef } from 'react'
import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { F5WizardKind, RegionSelection } from './types'

export type WizardDragState = {
  pageIndex: number
  sx: number
  sy: number
  cx: number
  cy: number
} | null

type Params = {
  open: boolean
  step: 'select' | 'wizard' | 'preview'
  wizardKindRef: MutableRefObject<F5WizardKind>
  wizardPageWrapRefs: MutableRefObject<(HTMLDivElement | null)[]>
  wizardViewerScrollRef: React.RefObject<HTMLDivElement | null>
  draggingRef: MutableRefObject<WizardDragState>
  setDragging: Dispatch<SetStateAction<WizardDragState>>
  setSelectionByKind: Dispatch<SetStateAction<Record<F5WizardKind, RegionSelection[]>>>
}

/** Window-level drag + edge scroll for F5 wizard region selection. */
export function useF5WizardDrag ({
  open,
  step,
  wizardKindRef,
  wizardPageWrapRefs,
  wizardViewerScrollRef,
  draggingRef,
  setDragging,
  setSelectionByKind,
}: Params): { startDragOnPage: (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => void } {
  const wizardWindowDragCleanupRef = useRef<(() => void) | null>(null)

  const detachWizardWindowDrag = () => {
    const fn = wizardWindowDragCleanupRef.current
    wizardWindowDragCleanupRef.current = null
    if (fn) fn()
  }

  useEffect(() => {
    return () => {
      detachWizardWindowDrag()
      draggingRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open || step !== 'wizard') {
      detachWizardWindowDrag()
      draggingRef.current = null
      setDragging(null)
    }
  }, [open, step, setDragging, draggingRef])

  const startDragOnPage = (pageIndex: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (step !== 'wizard') return
    if (e.button !== 0) return
    e.preventDefault()
    if (wizardWindowDragCleanupRef.current) {
      detachWizardWindowDrag()
      draggingRef.current = null
      setDragging(null)
    }
    const img = e.currentTarget.querySelector('img')
    if (!img) return
    const ir = img.getBoundingClientRect()
    const sx = e.clientX - ir.left
    const sy = e.clientY - ir.top
    const initial = { pageIndex, sx, sy, cx: sx, cy: sy }
    draggingRef.current = initial
    setDragging(initial)

    let lastEdgeScrollMs = 0
    const onMove = (ev: MouseEvent) => {
      const d = draggingRef.current
      if (!d) return
      const pageEl = wizardPageWrapRefs.current[d.pageIndex]
      if (!pageEl) return
      const imgEl = pageEl.querySelector('img')
      if (!imgEl) return
      const imgRect = imgEl.getBoundingClientRect()
      const cx = ev.clientX - imgRect.left
      const cy = ev.clientY - imgRect.top
      const next = { ...d, cx, cy }
      draggingRef.current = next
      setDragging(next)
      const scrollEl = wizardViewerScrollRef.current
      if (!scrollEl) return
      const sr = scrollEl.getBoundingClientRect()
      const edgePx = 44
      const scrollStep = 11
      const minIntervalMs = 32
      const inYEdge = ev.clientY >= sr.bottom - edgePx || ev.clientY <= sr.top + edgePx
      const inXEdge = ev.clientX >= sr.right - edgePx || ev.clientX <= sr.left + edgePx
      if (!inYEdge && !inXEdge) return
      const now = performance.now()
      if (now - lastEdgeScrollMs < minIntervalMs) return
      let scrolled = false
      if (ev.clientY >= sr.bottom - edgePx) {
        scrollEl.scrollTop += scrollStep
        scrolled = true
      } else if (ev.clientY <= sr.top + edgePx) {
        scrollEl.scrollTop -= scrollStep
        scrolled = true
      }
      if (ev.clientX >= sr.right - edgePx) {
        scrollEl.scrollLeft += scrollStep
        scrolled = true
      } else if (ev.clientX <= sr.left + edgePx) {
        scrollEl.scrollLeft -= scrollStep
        scrolled = true
      }
      if (scrolled) lastEdgeScrollMs = now
    }
    const onUp = (ev: MouseEvent) => {
      const current = draggingRef.current
      detachWizardWindowDrag()
      draggingRef.current = null
      setDragging(null)
      if (!current) return
      const pageEl = wizardPageWrapRefs.current[current.pageIndex]
      if (!pageEl) return
      const imgEl = pageEl.querySelector('img')
      if (!imgEl) return
      const imgRect = imgEl.getBoundingClientRect()
      const ex = ev.clientX - imgRect.left
      const ey = ev.clientY - imgRect.top
      const x = Math.min(current.sx, ex)
      const y = Math.min(current.sy, ey)
      const w = Math.abs(ex - current.sx)
      const h = Math.abs(ey - current.sy)
      if (w >= 20 && h >= 20) {
        const kind = wizardKindRef.current
        const refW = imgEl.clientWidth
        const refH = imgEl.clientHeight
        setSelectionByKind((prev) => ({
          ...prev,
          [kind]: [...prev[kind], { pageIndex: current.pageIndex, x, y, w, h, refW, refH }],
        }))
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    wizardWindowDragCleanupRef.current = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }

  return { startDragOnPage }
}
