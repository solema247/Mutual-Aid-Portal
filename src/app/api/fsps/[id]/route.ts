import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { FSP_STATUSES } from '@/lib/grantManagement/fundTransferHelpers'
import { attachFspTreasuryRollups } from '@/lib/grantManagement/fspTreasury'

const FSP_SELECT =
  'id, name, status, contact_person, contact_email, contract_filename, contract_url, contract_signed, transfer_fee_percent, airtable_record_id, created_at, updated_at'

/** PUT /api/fsps/[id] */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.name === 'string') patch.name = body.name.trim()
    if (typeof body.status === 'string' && (FSP_STATUSES as readonly string[]).includes(body.status)) {
      patch.status = body.status
    }
    if ('contact_person' in body) patch.contact_person = body.contact_person?.trim() || null
    if ('contact_email' in body) patch.contact_email = body.contact_email?.trim() || null
    if ('contract_filename' in body) patch.contract_filename = body.contract_filename?.trim() || null
    if ('contract_url' in body) patch.contract_url = body.contract_url?.trim() || null
    if ('contract_signed' in body) patch.contract_signed = body.contract_signed || null
    if ('transfer_fee_percent' in body) {
      patch.transfer_fee_percent =
        body.transfer_fee_percent != null && body.transfer_fee_percent !== ''
          ? Number(body.transfer_fee_percent)
          : null
    }

    const { data, error } = await auth.ctx.supabase
      .from('fsps')
      .update(patch)
      .eq('id', params.id)
      .select(FSP_SELECT)
      .single()

    if (error) throw error
    const [withRollup] = await attachFspTreasuryRollups(getSupabaseAdmin(), [
      data as Record<string, unknown>,
    ])
    return NextResponse.json(withRollup)
  } catch (error) {
    console.error('Error updating fsp:', error)
    return NextResponse.json({ error: 'Failed to update FSP' }, { status: 500 })
  }
}

/** DELETE /api/fsps/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const { error } = await auth.ctx.supabase.from('fsps').delete().eq('id', params.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting fsp:', error)
    return NextResponse.json({ error: 'Failed to delete FSP' }, { status: 500 })
  }
}
