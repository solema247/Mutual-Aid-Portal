import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { grant_serial, grant_serial_id } = await request.json()
    const serialId = grant_serial || grant_serial_id

    if (!serialId) {
      return NextResponse.json({ error: 'Missing grant_serial' }, { status: 400 })
    }

    // Get or create workplan sequence
    const { data: existing, error: seqError } = await supabase
      .from('grant_workplan_seq')
      .select('last_workplan_number')
      .eq('grant_serial', serialId)
      .single()

    if (seqError && seqError.code !== 'PGRST116') { // Not found error
      throw seqError
    }

    let workplan_number
    if (!existing) {
      // Create new sequence starting at 1
      const { data: newSeq, error: insertError } = await supabase
        .from('grant_workplan_seq')
        .insert({
          grant_serial: serialId,
          last_workplan_number: 1
        })
        .select()
        .single()

      if (insertError) throw insertError
      workplan_number = 1
    } else {
      // Increment existing sequence
      const { data: updated, error: updateError } = await supabase
        .from('grant_workplan_seq')
        .update({ 
          last_workplan_number: existing.last_workplan_number + 1,
          last_used: new Date().toISOString()
        })
        .eq('grant_serial', serialId)
        .select()
        .single()

      if (updateError) throw updateError
      workplan_number = updated.last_workplan_number
    }

    const paddedNumber = workplan_number.toString().padStart(3, '0')
    const grant_id = `${serialId}-${paddedNumber}`

    return NextResponse.json({ workplan_number: paddedNumber, grant_id })
  } catch (error) {
    console.error('Error committing workplan number:', error)
    return NextResponse.json({ error: 'Failed to commit workplan number' }, { status: 500 })
  }
}