import { NextResponse } from 'next/server'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { findDecisionByIdentifier } from '@/lib/grantManagement/resolveDecisionKey'

// DELETE /api/distribution-decisions/[decisionId] - delete a decision (cascading allocations via FK)
export async function DELETE(
  _request: Request,
  { params }: { params: { decisionId: string } }
) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const decisionId = params.decisionId.trim()
    const decision = await findDecisionByIdentifier(auth.ctx.supabase, decisionId)

    if (!decision) {
      return NextResponse.json({ error: 'Distribution decision not found' }, { status: 404 })
    }

    const { error: deleteError } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .delete()
      .eq('id', decision.id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting distribution decision:', error)
    return NextResponse.json({ error: 'Failed to delete distribution decision' }, { status: 500 })
  }
}
