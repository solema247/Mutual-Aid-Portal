/**
 * LoHub / Hamza serial matching: map Google Sheet F1 serials → portal grant_ids.
 *
 * Khartoum:  LCC-FCDO-KR-0226-0058 → LCC-FCDO-KH-0326-0058
 *   - locality code (KR/OD/BH/JB/EN/OM) → KH
 *   - month segment 0226 → 0326 (any month shift handled by distance scoring)
 * Other states: LCC-FCDO-CD-0226-0099 → LCC-FCDO-CD-0326-0099
 *   - month segment only
 */

export const KHARTOUM_CODES = new Set(['KR', 'OD', 'BH', 'JB', 'EN', 'OM', 'KH'])

export interface PortalProjectRef {
  projectId: string
  grantId: string
}

/** Month-agnostic key: donor | state (Khartoum → KH) | padded workplan number */
export function serialKey(serial: string): string | null {
  const parts = String(serial).trim().split('-')
  if (parts.length !== 5) return null
  let [, donor, state, , num] = parts
  if (KHARTOUM_CODES.has(state)) state = 'KH'
  return `${donor}|${state}|${num.padStart(4, '0')}`
}

export function serialMonth(serial: string): number {
  const mmyy = String(serial).trim().split('-')[3] || ''
  const mm = parseInt(mmyy.slice(0, 2), 10)
  return Number.isFinite(mm) ? mm : 99
}

/**
 * Build sheet-serial → portal project map.
 * Exact grant_id wins; otherwise match on serialKey with greedy month assignment
 * (prefer portal month >= sheet month).
 */
export function buildSerialResolver(
  sheetSerials: string[],
  portalProjects: { id: string; grant_id: string | null }[]
): Map<string, PortalProjectRef> {
  const resolved = new Map<string, PortalProjectRef>()

  const exactByGrantId = new Map<string, PortalProjectRef>()
  const byKey = new Map<string, PortalProjectRef[]>()
  for (const p of portalProjects) {
    if (!p.grant_id) continue
    const gid = String(p.grant_id).trim()
    const ref: PortalProjectRef = { projectId: String(p.id), grantId: gid }
    exactByGrantId.set(gid, ref)
    const key = serialKey(gid)
    if (key) {
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key)!.push(ref)
    }
  }

  const usedProjectIds = new Set<string>()
  const pending: { serial: string; candidates: PortalProjectRef[] }[] = []

  for (const serial of new Set(sheetSerials)) {
    const exact = exactByGrantId.get(serial)
    if (exact) {
      resolved.set(serial, exact)
      usedProjectIds.add(exact.projectId)
      continue
    }
    const key = serialKey(serial)
    const candidates = key ? byKey.get(key) || [] : []
    if (candidates.length > 0) pending.push({ serial, candidates })
  }

  const pairs: { serial: string; ref: PortalProjectRef; score: number }[] = []
  for (const { serial, candidates } of pending) {
    const sheetMm = serialMonth(serial)
    for (const ref of candidates) {
      const delta = serialMonth(ref.grantId) - sheetMm
      const score = delta >= 0 ? delta : 100 - delta
      pairs.push({ serial, ref, score })
    }
  }
  pairs.sort((a, b) => a.score - b.score)
  for (const { serial, ref } of pairs) {
    if (resolved.has(serial) || usedProjectIds.has(ref.projectId)) continue
    resolved.set(serial, ref)
    usedProjectIds.add(ref.projectId)
  }

  return resolved
}
