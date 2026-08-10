/** UI helpers for F4 expense table: colors, amount formatting, fill keys. */

export type F4ExpenseFillKey =
  | 'expense_activity'
  | 'expense_amount_sdg'
  | 'expense_amount'
  | 'payment_date'
  | 'payment_method'
  | 'receipt_no'

export const F4_FILLABLE_KEYS: F4ExpenseFillKey[] = [
  'expense_activity',
  'expense_amount_sdg',
  'expense_amount',
  'payment_date',
  'payment_method',
  'receipt_no',
]

function normKey (s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Pill colors keyed by English sector name (stable across locale). */
const SECTOR_PILL_BY_NORM: Record<string, string> = {
  livelihoods: 'bg-[#FDD835] text-black border-transparent',
  'capacity building': 'bg-[#7B1FA2] text-white border-transparent',
  education: 'bg-[#0D47A1] text-white border-transparent',
  'mental and physical health': 'bg-[#E0E0E0] text-black border-transparent',
  'protection - evacuation': 'bg-[#E53935] text-black border-transparent',
  evacuation: 'bg-[#E53935] text-black border-transparent',
  'the needs of women and children': 'bg-[#EC407A] text-black border-transparent',
  'volunteer support': 'bg-[#FB8C00] text-black border-transparent',
  'volunteers support': 'bg-[#FB8C00] text-black border-transparent',
  'support logistic operations': 'bg-[#CFD8DC] text-black border-transparent',
  'health - medical supplies': 'bg-[#C62828] text-white border-transparent',
  'health support': 'bg-[#C62828] text-white border-transparent',
  'food security': 'bg-[#1B5E20] text-white border-transparent',
  'food baskets': 'bg-[#1B5E20] text-white border-transparent',
  wash: 'bg-[#29B6F6] text-black border-transparent',
  'peacebuilding / social cohesion': 'bg-[#1565C0] text-white border-transparent',
  'peacebuilding/social cohesion': 'bg-[#1565C0] text-white border-transparent',
  'youth space': 'bg-[#43A047] text-black border-transparent',
  'socioeconomic empowerment': 'bg-[#607D8B] text-white border-transparent',
  'agriculture support': 'bg-[#C8E6C9] text-[#1B5E20] border-transparent',
  infrastructure: 'bg-[#FFF8E1] text-[#5D4037] border-transparent',
  flexible: 'bg-[#ECEFF1] text-black border-transparent',
  'shelter centers': 'bg-[#8D6E63] text-white border-transparent',
  'community kitchen': 'bg-[#FF7043] text-black border-transparent',
  'alternative education': 'bg-[#5C6BC0] text-white border-transparent',
  communications: 'bg-[#26A69A] text-black border-transparent',
  other: 'bg-[#BDBDBD] text-black border-transparent',
}

const DEFAULT_SECTOR_PILL = 'bg-muted text-foreground border-border'

export function sectorPillClassName (sectorNameEn: string | null | undefined): string {
  if (!sectorNameEn?.trim()) return DEFAULT_SECTOR_PILL
  return SECTOR_PILL_BY_NORM[normKey(sectorNameEn)] || DEFAULT_SECTOR_PILL
}

export const PAYMENT_METHOD_OPTIONS = ['Bank Transfer', 'Cash'] as const
export type F4PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]

const PAYMENT_PILL: Record<string, string> = {
  'bank transfer': 'bg-[#1565C0] text-white border-transparent',
  cash: 'bg-[#43A047] text-white border-transparent',
}

export function paymentMethodPillClassName (method: string | null | undefined): string {
  if (!method?.trim()) return DEFAULT_SECTOR_PILL
  return PAYMENT_PILL[normKey(method)] || DEFAULT_SECTOR_PILL
}

export function formatAmountDisplay (
  value: number | null | undefined,
  locale: string,
  opts?: { maxFractionDigits?: number }
): string {
  if (value == null || !Number.isFinite(Number(value))) return ''
  const n = Number(value)
  const max = opts?.maxFractionDigits ?? (Number.isInteger(n) ? 0 : 2)
  return n.toLocaleString(locale.startsWith('ar') ? 'en-US' : locale, {
    maximumFractionDigits: max,
    minimumFractionDigits: 0,
  })
}

/** Strip grouping separators; keep digits, optional leading minus, and one decimal point. */
export function parseAmountInput (raw: string): number | null {
  const cleaned = String(raw || '')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim()
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return n
}

export function applyExpenseFill (
  rows: Array<Record<string, any>>,
  key: F4ExpenseFillKey,
  fromRow: number,
  toRow: number,
  fxRate: number | null
): Array<Record<string, any>> {
  if (fromRow < 0 || toRow < 0 || fromRow >= rows.length || toRow >= rows.length) return rows
  const lo = Math.min(fromRow, toRow)
  const hi = Math.max(fromRow, toRow)
  if (lo === hi) return rows
  const source = rows[fromRow]
  const next = rows.map((r) => ({ ...r }))
  for (let i = lo; i <= hi; i++) {
    if (i === fromRow) continue
    next[i] = { ...next[i], [key]: source[key] }
    if (key === 'expense_amount_sdg' && fxRate && fxRate > 0) {
      const sdg = Number(source.expense_amount_sdg)
      if (Number.isFinite(sdg) && sdg > 0) {
        next[i].expense_amount = +(sdg / fxRate).toFixed(2)
      }
    }
    if (key === 'expense_amount' && fxRate && fxRate > 0) {
      const usd = Number(source.expense_amount)
      if (Number.isFinite(usd) && usd > 0) {
        next[i].expense_amount_sdg = +(usd * fxRate).toFixed(2)
      }
    }
  }
  return next
}
