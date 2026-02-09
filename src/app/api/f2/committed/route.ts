import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

// GET /api/f2/committed - Get all committed F1s with optional filtering
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const grantId = searchParams.get('grant_id')
    const donorName = searchParams.get('donor_name')
    const state = searchParams.get('state')

    // Get user's state access rights
    const { allowedStateNames } = await getUserStateAccess()

    let query = supabase
      .from('err_projects')
      .select(`
        id,
        err_id,
        date,
        state,
        locality,
        status,
        funding_status,
        expenses,
        grant_call_id,
        emergency_room_id,
        emergency_rooms (err_code, name_ar, name),
        submitted_at,
        funding_cycle_id,
        funding_cycles (id, name, year),
        mou_id,
        file_key,
        temp_file_key,
        grant_id,
        grant_serial_id,
        workplan_number,
        approval_file_key
      `)
      .eq('funding_status', 'committed')
      .order('submitted_at', { ascending: false })

    // Apply state filter from user access rights (if not seeing all states)
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      query = query.in('state', allowedStateNames)
    }

    // Apply explicit state filter if provided (further restricts)
    if (state) {
      query = query.eq('state', state)
    }

    const { data, error } = await query

    if (error) throw error

    // Fetch all grants from grants_grid_view to match project serials
    const { data: grantsData } = await supabase
      .from('grants_grid_view')
      .select('grant_id, project_name, donor_name, activities')
    
    // Build a map of project serial to grant info
    const serialToGrant = new Map<string, { grant_id: string; donor_name: string | null }>()
    for (const grant of grantsData || []) {
      if (grant.activities) {
        const serials = grant.activities.split(',').map((s: string) => s.trim()).filter(Boolean)
        for (const serial of serials) {
          serialToGrant.set(serial, {
            grant_id: grant.grant_id,
            donor_name: grant.donor_name
          })
        }
      }
    }

    let formattedF1s = (data || []).map((f1: any) => {
      // Check if this project has been assigned (has grant_id that matches a serial)
      let grantInfo = null
      if (f1.grant_id && f1.grant_id.startsWith('LCC-')) {
        grantInfo = serialToGrant.get(f1.grant_id)
      }
      
      // Filter by grant if specified
      if (grantId && donorName) {
        if (!grantInfo || grantInfo.grant_id !== grantId || grantInfo.donor_name !== donorName) {
          return null // Filter out this F1
        }
      }
      
      return {
        id: f1.id,
        err_id: f1.err_id,
        date: f1.date,
        state: f1.state,
        locality: f1.locality,
        status: f1.status,
        funding_status: f1.funding_status,
        expenses: typeof f1.expenses === 'string' ? JSON.parse(f1.expenses) : f1.expenses || [],
        grant_call_id: f1.grant_call_id,
        // Only use grants_grid_view - no fallback to grant_calls
        grant_call_name: grantInfo?.grant_id || null,
        donor_name: grantInfo?.donor_name || null,
        emergency_room_id: f1.emergency_room_id,
        err_code: f1.emergency_rooms?.err_code || null,
        err_name: f1.emergency_rooms?.name_ar || f1.emergency_rooms?.name || null,
        submitted_at: f1.submitted_at,
        committed_at: f1.submitted_at,
        funding_cycle_id: f1.funding_cycle_id,
        funding_cycle_name: f1.funding_cycles?.name || null,
        mou_id: f1.mou_id || null,
        file_key: f1.file_key || null,
        temp_file_key: f1.temp_file_key || null,
        grant_id: f1.grant_id || null,
        grant_serial_id: f1.grant_serial_id || null,
        workplan_number: f1.workplan_number || null,
        approval_file_key: f1.approval_file_key || null
      }
    }).filter((f1): f1 is NonNullable<typeof f1> => f1 !== null)

    // Apply client-side filters that can't be done in SQL
    if (search) {
      const searchLower = search.toLowerCase()
      formattedF1s = formattedF1s.filter(f1 => 
        (f1.err_id && f1.err_id.toLowerCase().includes(searchLower)) ||
        (f1.state && f1.state.toLowerCase().includes(searchLower)) ||
        (f1.locality && f1.locality.toLowerCase().includes(searchLower)) ||
        (f1.grant_call_name && f1.grant_call_name.toLowerCase().includes(searchLower)) ||
        (f1.donor_name && f1.donor_name.toLowerCase().includes(searchLower))
      )
    }

    return NextResponse.json(formattedF1s)
  } catch (error) {
    console.error('Error fetching committed F1s:', error)
    return NextResponse.json({ error: 'Failed to fetch committed F1s' }, { status: 500 })
  }
}
