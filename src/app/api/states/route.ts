import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('states')
      .select('id, state_name, state_name_ar')
      .not('state_name', 'is', null)
      .order('state_name')

    if (error) throw error

    // Get unique states by state_name (in case there are duplicates)
    const stateMap = new Map<string, { id: string; state_name: string; state_name_ar: string | null }>()
    data?.forEach((state: any) => {
      if (!stateMap.has(state.state_name)) {
        stateMap.set(state.state_name, {
          id: state.id,
          state_name: state.state_name,
          state_name_ar: state.state_name_ar
        })
      }
    })

    const uniqueStates = Array.from(stateMap.values())

    return NextResponse.json(uniqueStates)
  } catch (error) {
    console.error('Error fetching states:', error)
    return NextResponse.json({ error: 'Failed to fetch states' }, { status: 500 })
  }
}
