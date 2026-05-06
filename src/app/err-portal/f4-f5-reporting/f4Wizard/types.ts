export type WizardKind = 'table' | 'questions' | 'receipts'

/** Snip rect is in CSS px relative to the page <img>. refW/refH = img.clientWidth/Height when the box was drawn. */
export type RegionSelection = {
  pageIndex: number
  x: number
  y: number
  w: number
  h: number
  refW?: number
  refH?: number
}

/** Rendered page: high-res bitmap with optional logical display size (CSS px) for sharp PDF viewing */
export type WizardPageEntry = { dataUrl: string; displayWidth: number; displayHeight: number }

export function normalizeWizardPage (page: unknown): WizardPageEntry | null {
  if (page == null) return null
  if (typeof page === 'string') {
    return page ? { dataUrl: page, displayWidth: 0, displayHeight: 0 } : null
  }
  if (typeof page === 'object' && 'dataUrl' in page && typeof (page as WizardPageEntry).dataUrl === 'string') {
    const p = page as WizardPageEntry
    return {
      dataUrl: p.dataUrl,
      displayWidth: Number(p.displayWidth) || 0,
      displayHeight: Number(p.displayHeight) || 0,
    }
  }
  return null
}
