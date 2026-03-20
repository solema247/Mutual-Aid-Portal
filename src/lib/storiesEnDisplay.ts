/**
 * English UI: show primary Arabic/English columns when report was authored in EN;
 * otherwise show cached _en translations from err_program_report / err_program_reach.
 */

export function reportIsEnglish(language: string | null | undefined): boolean {
  const l = (language ?? '').toLowerCase().trim()
  return l === 'en' || l.startsWith('en-')
}

/** F5 narrative field for English UI. */
export function pickF5TextForEnUi(
  language: string | null | undefined,
  primary: string | null | undefined,
  enCached: string | null | undefined
): string | null {
  if (reportIsEnglish(language)) {
    const p = primary?.trim()
    return p ? primary! : null
  }
  const e = enCached?.trim()
  if (e) return enCached!
  const p = primary?.trim()
  return p ? primary! : null
}

/** Reach field for English UI (follows parent report language). */
export function pickReachTextForEnUi(
  reportLanguage: string | null | undefined,
  primary: string | null | undefined,
  enCached: string | null | undefined
): string | null {
  if (reportIsEnglish(reportLanguage)) {
    const p = primary?.trim()
    return p ? primary! : null
  }
  const e = enCached?.trim()
  if (e) return enCached!
  const p = primary?.trim()
  return p ? primary! : null
}
