import type { MOU } from '../types'

export function parsePaymentConfirmations(
  paymentFile: string | null
): Record<string, { file_path: string; exchange_rate?: number; transfer_date?: string }> {
  if (!paymentFile) return {}
  try {
    const parsed = JSON.parse(paymentFile)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed
    }
  } catch {
    return {}
  }
  return {}
}

export function formatPaymentConfirmations(
  confirmations: Record<string, { file_path: string; exchange_rate?: number; transfer_date?: string }>
): string {
  return JSON.stringify(confirmations)
}

function countConfirmedFromLegacyJson(mou: MOU): number {
  if (!mou.payment_confirmation_file) return 0
  try {
    const parsed = JSON.parse(mou.payment_confirmation_file)
    if (typeof parsed !== 'object' || parsed === null) return 0
    let confirmed = 0
    for (const projectId of Object.keys(parsed)) {
      const entry = parsed[projectId]
      if (!entry || typeof entry !== 'object') continue
      const hasFile = !!(entry.file_path && String(entry.file_path).trim())
      const rate = entry.exchange_rate
      const date = entry.transfer_date
      const hasMeta = !!(
        rate != null &&
        String(rate).trim() !== '' &&
        date != null &&
        String(date).trim() !== ''
      )
      if (hasFile || hasMeta) confirmed += 1
    }
    return confirmed
  } catch {
    return mou.payment_confirmation_file ? 1 : 0
  }
}

/**
 * Count projects with at least one payment confirmation.
 * Prefers relational enrichment (`paymentConfirmedCounts`) when provided.
 */
export function getPaymentConfirmationCount(
  mou: MOU,
  projectCount: number,
  paymentConfirmedCounts?: Record<string, number>
): { confirmed: number; total: number } {
  const relational = paymentConfirmedCounts?.[mou.id]
  const legacy = countConfirmedFromLegacyJson(mou)
  const confirmed =
    relational != null ? Math.max(relational, legacy) : legacy
  const total = Math.max(projectCount, confirmed)
  return { confirmed, total }
}
