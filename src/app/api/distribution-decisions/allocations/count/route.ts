import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// Helper function to fetch all rows using pagination
const fetchAllRows = async (supabase: any, table: string, select: string) => {
  let allData: any[] = []
  let from = 0
  const pageSize = 1000
  let hasMore = true

  while (hasMore) {
    const { data: page, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)
    
    if (error) throw error
    
    if (page && page.length > 0) {
      allData = [...allData, ...page]
      from += pageSize
      hasMore = page.length === pageSize
    } else {
      hasMore = false
    }
  }
  
  return allData
}

// GET /api/distribution-decisions/allocations/count - Get total count of allocations
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    
    const allocData = await fetchAllRows(supabase, 'allocations_by_date', '"Allocation_ID"')
    const count = allocData.length
    
    return NextResponse.json({ count })
  } catch (error) {
    console.error('Error counting allocations:', error)
    return NextResponse.json({ error: 'Failed to count allocations' }, { status: 500 })
  }
}

