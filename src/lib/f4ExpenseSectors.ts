export type F4SectorRow = {
  id: string
  sector_name_en: string
  sector_name_ar: string | null
}

export function normalizeF4SectorKey (s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

function canonicalEn (s: F4SectorRow): string {
  return String(s.sector_name_en || '').trim()
}

/** Load sectors from DB for F4 expense activity matching (same table as F1/F2). */
export async function fetchF4SectorsForMatch (supabase: { from: (t: string) => any }): Promise<F4SectorRow[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('id, sector_name_en, sector_name_ar')
    .order('sector_name_en', { ascending: true })
  if (error) {
    console.warn('[F4 sectors] fetch failed', error.message)
    return []
  }
  return (data || []) as F4SectorRow[]
}

/**
 * Map OCR / free-text activity to a single `sector_name_en` from `sectors`.
 * If `sectors` is empty, returns trimmed raw (legacy). Otherwise falls back to "Flexible" when unmatched.
 */
export function matchRawActivityToSectorNameEn (
  raw: string | null | undefined,
  sectors: F4SectorRow[]
): string {
  if (!sectors.length) return raw == null ? '' : String(raw).trim()

  const fallback =
    sectors.find((s) => normalizeF4SectorKey(canonicalEn(s)) === 'flexible')?.sector_name_en.trim() || 'Flexible'

  if (raw == null || String(raw).trim() === '') return fallback

  const normRaw = normalizeF4SectorKey(String(raw))

  for (const s of sectors) {
    const en = normalizeF4SectorKey(canonicalEn(s))
    if (normRaw === en) return canonicalEn(s)
    const ar = s.sector_name_ar ? normalizeF4SectorKey(s.sector_name_ar) : ''
    if (ar && normRaw === ar) return canonicalEn(s)
  }

  let bestScore = -1
  let bestEn = ''
  for (const s of sectors) {
    const canon = canonicalEn(s)
    const enKey = normalizeF4SectorKey(canon)
    const ar = s.sector_name_ar ? normalizeF4SectorKey(s.sector_name_ar) : ''

    const consider = (a: string, b: string, scoreBase: number) => {
      if (!a || !b) return
      if (a.includes(b)) {
        const score = scoreBase + b.length
        if (score > bestScore) {
          bestScore = score
          bestEn = canon
        }
      }
    }

    if (enKey.length >= 3) {
      consider(normRaw, enKey, 1000)
      consider(enKey, normRaw, normRaw.length >= 4 ? 500 : 0)
    }
    if (ar.length >= 3) {
      consider(normRaw, ar, 1000)
      consider(ar, normRaw, normRaw.length >= 4 ? 500 : 0)
    }
  }

  return bestScore >= 0 ? bestEn : fallback
}

export function normalizeF4ExpenseActivitiesToSectors<T extends { expense_activity?: string | null }> (
  expenses: T[],
  sectors: F4SectorRow[]
): T[] {
  return expenses.map((e) => ({
    ...e,
    expense_activity: matchRawActivityToSectorNameEn(e.expense_activity, sectors),
  }))
}
