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

export function getPaymentConfirmationCount(
  mou: MOU,
  projectCount: number
): { confirmed: number; total: number } {
  if (!mou.payment_confirmation_file) {
    return { confirmed: 0, total: projectCount }
  }
  try {
    const parsed = JSON.parse(mou.payment_confirmation_file)
    if (typeof parsed !== 'object' || parsed === null) {
      return { confirmed: 0, total: projectCount }
    }
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
    const total = Math.max(projectCount, confirmed)
    return { confirmed, total }
  } catch {
    return { confirmed: 1, total: projectCount }
  }
}
