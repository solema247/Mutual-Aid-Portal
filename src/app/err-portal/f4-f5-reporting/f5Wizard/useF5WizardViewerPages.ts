import { useEffect } from 'react'
import type { WizardPageEntry } from './types'

type ViewerMode = 'pdf' | 'image' | 'unsupported'

type Params = {
  step: 'select' | 'wizard' | 'preview'
  fileUrl: string
  file: File | null
  tempKey: string
  setViewerMode: (m: ViewerMode) => void
  setWizardPages: (p: WizardPageEntry[]) => void
  setIsRenderingPages: (v: boolean) => void
}

/** Renders PDF pages or a single image into data URLs for the F5 wizard viewer. */
export function useF5WizardViewerPages ({
  step,
  fileUrl,
  file,
  tempKey,
  setViewerMode,
  setWizardPages,
  setIsRenderingPages,
}: Params): void {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (step !== 'wizard' || !fileUrl) return
      setIsRenderingPages(true)
      try {
        const urlLooksPdf = /\.pdf(?:\?|#|$)/i.test(String(fileUrl || ''))
        const isPdf =
          file?.type === 'application/pdf' ||
          file?.type === 'application/x-pdf' ||
          /\.pdf$/i.test(String(tempKey || '')) ||
          /\.pdf$/i.test(String(file?.name || '')) ||
          urlLooksPdf
        const urlLooksImage = /\.(png|jpg|jpeg|webp|gif)(?:\?|#|$)/i.test(String(fileUrl || ''))
        const isImage =
          file?.type?.startsWith('image/') ||
          /\.(png|jpg|jpeg|webp|gif)$/i.test(String(file?.name || '')) ||
          urlLooksImage
        if (isPdf) {
          const pdfJsUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs'
          const pdfjs = await import(/* webpackIgnore: true */ pdfJsUrl)
          const resp = await fetch(fileUrl)
          const ab = await resp.arrayBuffer()
          ;(pdfjs as any).GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'
          const loadingTask = (pdfjs as any).getDocument({ data: ab, disableWorker: false })
          const pdf = await loadingTask.promise
          const pages: WizardPageEntry[] = []
          const pageCount = Math.min(pdf.numPages || 0, 20)
          const PDF_BASE_SCALE = 1.42
          const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
          for (let i = 1; i <= pageCount; i++) {
            const page = await pdf.getPage(i)
            const logicalVp = page.getViewport({ scale: PDF_BASE_SCALE })
            const viewport = page.getViewport({ scale: PDF_BASE_SCALE * dpr })
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d', { alpha: false })
            if (!ctx) continue
            canvas.width = Math.floor(viewport.width)
            canvas.height = Math.floor(viewport.height)
            await page.render({ canvasContext: ctx, viewport }).promise
            const dataUrl = canvas.toDataURL('image/png')
            pages.push({
              dataUrl,
              displayWidth: Math.floor(logicalVp.width),
              displayHeight: Math.floor(logicalVp.height),
            })
          }
          if (!cancelled) {
            setViewerMode('pdf')
            setWizardPages(pages)
          }
          return
        }
        if (isImage) {
          const resp = await fetch(fileUrl)
          const blob = await resp.blob()
          const reader = new FileReader()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => reject(new Error('Failed to read image'))
            reader.readAsDataURL(blob)
          })
          const probe = new Image()
          await new Promise<void>((resolve, reject) => {
            probe.onload = () => resolve()
            probe.onerror = () => reject(new Error('Failed to load image'))
            probe.src = dataUrl
          })
          if (!cancelled) {
            setViewerMode('image')
            setWizardPages([{ dataUrl, displayWidth: probe.naturalWidth, displayHeight: probe.naturalHeight }])
          }
          return
        }
        if (!cancelled) {
          setViewerMode('unsupported')
          setWizardPages([])
        }
      } catch (e) {
        console.error('[F5 wizard] failed to render viewer pages', e)
        if (!cancelled) {
          setViewerMode('unsupported')
          setWizardPages([])
        }
      } finally {
        if (!cancelled) setIsRenderingPages(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [step, fileUrl, file?.type, file?.name, tempKey, setViewerMode, setWizardPages, setIsRenderingPages])
}
