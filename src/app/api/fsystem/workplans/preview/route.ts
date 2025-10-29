import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const grant_serial = searchParams.get('grant_serial_id')

    if (!grant_serial) {
      return NextResponse.json({ error: 'Missing grant_serial' }, { status: 400 })
    }

    // Get the next workplan number
    const { data: workplans, error: workplanError } = await supabase
      .from('grant_workplan_seq')
      .select('last_workplan_number')
      .eq('grant_serial', grant_serial)
      .single()

    if (workplanError && workplanError.code !== 'PGRST116') { // Not found error
      throw workplanError
    }

    const nextNumber = workplans ? workplans.last_workplan_number + 1 : 1
    const paddedNumber = nextNumber.toString().padStart(3, '0')
    const preview_id = `${grant_serial}-${paddedNumber}`

    return NextResponse.json({ next_number: paddedNumber, preview_id })
  } catch (error) {
    console.error('Error getting workplan preview:', error)
    return NextResponse.json({ error: 'Failed to get workplan preview' }, { status: 500 })
  }
}
