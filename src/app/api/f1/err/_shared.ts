import type { SupabaseClient } from '@supabase/supabase-js'

export async function getCycleYYMM (
  supabase: SupabaseClient,
  fundingCycleId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('funding_cycles')
    .select('start_date')
    .eq('id', fundingCycleId)
    .single()

  if (error || !data?.start_date) {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    return `${mm}${yy}`
  }

  const start = new Date(data.start_date as string)
  const yy = String(start.getFullYear()).slice(-2)
  const mm = String(start.getMonth() + 1).padStart(2, '0')
  return `${mm}${yy}`
}

export function requestOrigin (request: Request): string {
  const host = request.headers.get('host')
  if (!host) return 'http://localhost:3001'
  const proto = request.headers.get('x-forwarded-proto') || 'http'
  return `${proto}://${host}`
}

export function isApprovedUnassigned (row: {
  status: string
  funding_status: string | null
}): boolean {
  if (row.status !== 'approved') return false
  return (row.funding_status || '').toLowerCase() === 'unassigned'
}
