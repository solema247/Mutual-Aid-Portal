import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { FSP_STATUSES, transferAmount } from '@/lib/grantManagement/fundTransferHelpers'

const FSP_SELECT =
  'id, name, status, contact_person, contact_email, contract_filename, contract_url, contract_signed, transfer_fee_percent, treasury_in_usd, treasury_out_usd, airtable_record_id, created_at, updated_at'

function withTreasuryBalance(f: Record<string, unknown>) {
  const inn = f.treasury_in_usd != null ? Number(f.treasury_in_usd) : 0
  const out = f.treasury_out_usd != null ? Number(f.treasury_out_usd) : 0
  return {
    ...f,
    treasury_in_usd: inn,
    treasury_out_usd: out,
    balance: inn - out,
  }
}

async function attachRollups(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  fsps: Array<Record<string, unknown>>
) {
  if (!fsps.length) return fsps.map(withTreasuryBalance)
  const ids = fsps.map((f) => f.id as string)
  const { data: transfers } = await supabase
    .from('transfer_segments')
    .select('fsp_id, activity_amount, transfer_fee_amount')
    .in('fsp_id', ids)

  const byFsp = new Map<string, { activity: number; fees: number; total: number }>()
  for (const t of transfers || []) {
    const id = t.fsp_id as string
    if (!id) continue
    const cur = byFsp.get(id) || { activity: 0, fees: 0, total: 0 }
    const activity = Number(t.activity_amount) || 0
    const fees = Number(t.transfer_fee_amount) || 0
    cur.activity += activity
    cur.fees += fees
    cur.total += transferAmount(activity, fees) || 0
    byFsp.set(id, cur)
  }

  return fsps.map((f) => {
    const r = byFsp.get(f.id as string) || { activity: 0, fees: 0, total: 0 }
    return {
      ...withTreasuryBalance(f),
      activity_funds: r.activity,
      fees: r.fees,
      total_funds: r.total,
    }
  })
}

function parseTreasuryAmount(value: unknown): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** GET /api/fsps */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    let { data, error } = await supabase.from('fsps').select(FSP_SELECT).order('name')
    // Until treasury columns are migrated, fall back so the page still loads.
    if (error && /treasury_in_usd|treasury_out_usd|column/i.test(error.message)) {
      const fallback = await supabase
        .from('fsps')
        .select(
          'id, name, status, contact_person, contact_email, contract_filename, contract_url, contract_signed, transfer_fee_percent, airtable_record_id, created_at, updated_at'
        )
        .order('name')
      data = (fallback.data || []).map((row) => ({
        ...row,
        treasury_in_usd: 0,
        treasury_out_usd: 0,
      }))
      error = fallback.error
    }
    if (error) throw error
    const withRollups = await attachRollups(supabase, (data || []) as Record<string, unknown>[])
    return NextResponse.json(withRollups)
  } catch (error) {
    console.error('Error fetching fsps:', error)
    return NextResponse.json({ error: 'Failed to fetch FSPs' }, { status: 500 })
  }
}

/** POST /api/fsps */
export async function POST(request: NextRequest) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const status =
      typeof body.status === 'string' && (FSP_STATUSES as readonly string[]).includes(body.status)
        ? body.status
        : 'Prospect'

    const { data, error } = await auth.ctx.supabase
      .from('fsps')
      .insert({
        name,
        status,
        contact_person: body.contact_person?.trim() || null,
        contact_email: body.contact_email?.trim() || null,
        contract_filename: body.contract_filename?.trim() || null,
        contract_url: body.contract_url?.trim() || null,
        contract_signed: body.contract_signed || null,
        transfer_fee_percent:
          body.transfer_fee_percent != null && body.transfer_fee_percent !== ''
            ? Number(body.transfer_fee_percent)
            : null,
        treasury_in_usd: parseTreasuryAmount(body.treasury_in_usd),
        treasury_out_usd: parseTreasuryAmount(body.treasury_out_usd),
        updated_at: new Date().toISOString(),
      })
      .select(FSP_SELECT)
      .single()

    if (error) throw error
    return NextResponse.json(withTreasuryBalance(data as Record<string, unknown>), { status: 201 })
  } catch (error) {
    console.error('Error creating fsp:', error)
    return NextResponse.json({ error: 'Failed to create FSP' }, { status: 500 })
  }
}
