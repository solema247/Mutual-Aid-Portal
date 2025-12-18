import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// DELETE /api/distribution-decisions/[decisionId] - delete a decision and cascading allocations (FK handles allocations)
export async function DELETE(
  _request: Request,
  { params }: { params: { decisionId: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const decisionId = params.decisionId

    // Delete by decision_id_proposed (string key)
    const { error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .delete()
      .eq('decision_id_proposed', decisionId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting distribution decision:', error)
    return NextResponse.json({ error: 'Failed to delete distribution decision' }, { status: 500 })
  }
}

