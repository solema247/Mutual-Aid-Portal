import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  try {
    const { data, error } = await supabase
      .from('states')
      .select('state_name')
      .order('state_name')

    if (error) throw error

    // Get unique states
    const uniqueStates = Array.from(
      new Map(data.map(state => [state.state_name, state])).values()
    )

    return NextResponse.json(uniqueStates)
  } catch (error) {
    console.error('Error fetching states:', error)
    return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 })
  }
}
