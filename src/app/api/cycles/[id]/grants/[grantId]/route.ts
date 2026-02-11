import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

// DELETE /api/cycles/[id]/grants/[grantId] - Remove a grant from a cycle
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; grantId: string } }
) {
  try {
    const auth = await requirePermission('grant_remove_grant')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const { id: cycleId, grantId } = params

    // Delete the inclusion directly
    const { error: deleteError } = await supabase
      .from('cycle_grant_inclusions')
      .delete()
      .eq('cycle_id', cycleId)
      .eq('grant_call_id', grantId)

    if (deleteError) {
      console.error('Error deleting grant inclusion:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete grant inclusion' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing grant from cycle:', error)
    return NextResponse.json(
      { error: 'Failed to remove grant from cycle' },
      { status: 500 }
    )
  }
}
