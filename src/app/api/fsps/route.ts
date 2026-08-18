import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { FSP_STATUSES } from '@/lib/grantManagement/fundTransferHelpers'
import { attachFspTreasuryRollups } from '@/lib/grantManagement/fspTreasury'

const FSP_SELECT =
  'id, name, status, contact_person, contact_email, contract_filename, contract_url, contract_signed, transfer_fee_percent, airtable_record_id, created_at, updated_at'

/** GET /api/fsps */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.from('fsps').select(FSP_SELECT).order('name')
    if (error) throw error
    const withRollups = await attachFspTreasuryRollups(
      supabase,
      (data || []) as Record<string, unknown>[]
    )
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
        updated_at: new Date().toISOString(),
      })
      .select(FSP_SELECT)
      .single()

    if (error) throw error
    const [withRollup] = await attachFspTreasuryRollups(getSupabaseAdmin(), [
      data as Record<string, unknown>,
    ])
    return NextResponse.json(withRollup, { status: 201 })
  } catch (error) {
    console.error('Error creating fsp:', error)
    return NextResponse.json({ error: 'Failed to create FSP' }, { status: 500 })
  }
}
