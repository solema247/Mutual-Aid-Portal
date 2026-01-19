import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// DELETE /api/distribution-decisions/[decisionId] - delete a decision and cascading allocations (FK handles allocations)
export async function DELETE(
  _request: Request,
  { params }: { params: { decisionId: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    // Trim the decisionId to handle trailing/leading whitespace issues
    const decisionId = params.decisionId.trim()

    // First, find the record by checking both decision_id_proposed and decision_id
    // We need to handle potential whitespace in the database values
    const { data: records, error: fetchError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select('id')
      .or(`decision_id_proposed.eq.${decisionId},decision_id.eq.${decisionId}`)

    if (fetchError) throw fetchError

    // If no record found, try with trimmed versions (in case DB has trailing spaces)
    let recordToDelete = records?.[0]
    if (!recordToDelete) {
      // Try fetching all and matching with trimmed comparison
      const { data: allRecords, error: allError } = await supabase
        .from('distribution_decision_master_sheet_1')
        .select('id, decision_id_proposed, decision_id')

      if (allError) throw allError

      recordToDelete = allRecords?.find(
        (r) =>
          (r.decision_id_proposed?.trim() === decisionId) ||
          (r.decision_id?.trim() === decisionId)
      )
    }

    if (!recordToDelete) {
      return NextResponse.json({ error: 'Distribution decision not found' }, { status: 404 })
    }

    // Delete by UUID id (most reliable)
    const { error: deleteError } = await supabase
      .from('distribution_decision_master_sheet_1')
      .delete()
      .eq('id', recordToDelete.id)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting distribution decision:', error)
    return NextResponse.json({ error: 'Failed to delete distribution decision' }, { status: 500 })
  }
}

