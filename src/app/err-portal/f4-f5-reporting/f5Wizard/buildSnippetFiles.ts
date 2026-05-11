import type { F5WizardKind, RegionSelection, WizardPageEntry } from './types'
import { normalizeWizardPage } from './types'

/**
 * Crop viewer selections to PNG files for `/api/f5/parse-snips`.
 * Maps CSS selection coords (relative to displayed image + refW/refH) -> bitmap pixels.
 */
export async function buildSnippetFilesFromSelections (
  kind: F5WizardKind,
  wizardPages: WizardPageEntry[],
  selections: RegionSelection[]
): Promise<File[]> {
  if (!selections.length) return []
  const files: File[] = []
  for (let i = 0; i < selections.length; i++) {
    const sel = selections[i]
    const pageEntry = normalizeWizardPage(wizardPages[sel.pageIndex])
    if (!pageEntry?.dataUrl) continue
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Failed to load page image'))
      el.src = pageEntry.dataUrl
    })
    const x = Math.max(0, Math.floor(sel.x))
    const y = Math.max(0, Math.floor(sel.y))
    const w = Math.max(1, Math.floor(sel.w))
    const h = Math.max(1, Math.floor(sel.h))
    const refW = sel.refW ?? (pageEntry.displayWidth || img.naturalWidth)
    const refH = sel.refH ?? (pageEntry.displayHeight || img.naturalHeight)
    const rx = img.naturalWidth / Math.max(1, refW)
    const ry = img.naturalHeight / Math.max(1, refH)
    let sx = x * rx
    let sy = y * ry
    let sw = w * rx
    let sh = h * ry
    sx = Math.max(0, Math.min(sx, img.naturalWidth - 1))
    sy = Math.max(0, Math.min(sy, img.naturalHeight - 1))
    sw = Math.max(1, Math.min(sw, img.naturalWidth - sx))
    sh = Math.max(1, Math.min(sh, img.naturalHeight - sy))
    const outW = Math.max(1, Math.floor(sw))
    const outH = Math.max(1, Math.floor(sh))
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) continue
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) continue
    files.push(new File([blob], `${kind}-snip-${i + 1}.png`, { type: 'image/png' }))
  }
  return files
}
