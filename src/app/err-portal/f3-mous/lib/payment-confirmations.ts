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

export type PaymentConfirmationEntry = {
  file_path?: string
  exchange_rate?: number | string
  transfer_date?: string
}

export function isPaymentConfirmationComplete(
  entry: PaymentConfirmationEntry | undefined
): boolean {
  if (!entry) return false
  const hasFile = !!(entry.file_path && String(entry.file_path).trim())
  const hasMeta = !!(
    entry.exchange_rate != null &&
    String(entry.exchange_rate).trim() !== '' &&
    entry.transfer_date != null &&
    String(entry.transfer_date).trim() !== ''
  )
  return hasFile || hasMeta
}

/** Project ids on this MOU that have payment confirmation recorded. */
export function getPaymentConfirmedProjectIds(
  paymentFile: string | null,
  mouProjectIds: string[],
  mouFallback?: { exchange_rate?: number | null; transfer_date?: string | null }
): Set<string> {
  const confirmed = new Set<string>()
  if (!paymentFile || mouProjectIds.length === 0) return confirmed

  if (!paymentFile.startsWith('{')) {
    if (
      isPaymentConfirmationComplete({
        file_path: paymentFile,
        exchange_rate: mouFallback?.exchange_rate ?? undefined,
        transfer_date: mouFallback?.transfer_date ?? undefined,
      })
    ) {
      confirmed.add(mouProjectIds[0])
    }
    return confirmed
  }

  const existing = parsePaymentConfirmations(paymentFile)
  for (const projectId of mouProjectIds) {
    if (isPaymentConfirmationComplete(existing[projectId])) {
      confirmed.add(projectId)
    }
  }
  return confirmed
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
