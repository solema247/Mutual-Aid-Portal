import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import {
  AD_DECISION_SERIAL_FLOOR,
  buildAdDecisionId,
  extractAdHyphenSerial,
  formatAdDateYyMmDd,
  partnerCodeForId,
} from '@/lib/grantManagement/adDecisionIds'

/**
 * GET /api/distribution-decisions/next-id?partner=P2H&date=2026-07-15
 * Preview the next auto-generated decision_id_proposed.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const partner = searchParams.get('partner')?.trim() || ''
    const date = searchParams.get('date')?.trim() || ''

    const code = partnerCodeForId(partner)
    const datePart = formatAdDateYyMmDd(date)
    if (!code || !datePart) {
      return NextResponse.json(
        { error: 'partner and date (YYYY-MM-DD) are required', decision_id_proposed: null },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdmin()
    const { data: decisions, error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_id_proposed, decision_id')

    if (error) throw error

    let maxSerial = AD_DECISION_SERIAL_FLOOR
    for (const row of decisions || []) {
      for (const id of [row.decision_id_proposed, row.decision_id]) {
        const n = extractAdHyphenSerial(id)
        if (n != null && n > maxSerial) maxSerial = n
      }
    }

    const nextSerial = maxSerial + 1
    const decision_id_proposed = buildAdDecisionId(partner, date, nextSerial)

    return NextResponse.json({
      decision_id_proposed,
      serial: nextSerial,
      partner_code: code,
      date_part: datePart,
    })
  } catch (error) {
    console.error('Error computing next decision id:', error)
    return NextResponse.json({ error: 'Failed to compute next decision id' }, { status: 500 })
  }
}
