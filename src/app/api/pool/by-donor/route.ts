import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Helper function to fetch all rows with pagination
async function fetchAllRows<T>(
  supabase: any,
  table: string,
  select: string,
  filter?: (query: any) => any
): Promise<T[]> {
  const allRows: T[] = []
  let from = 0
  const pageSize = 1000

  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (filter) {
      query = filter(query)
    }
    const { data, error } = await query
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

// GET /api/pool/by-donor - Aggregated by donor and grant from grants_grid_view
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    
    // Fetch all grants from grants_grid_view with activities
    const grants = await fetchAllRows(
      supabase,
      'grants_grid_view',
      'grant_id, donor_name, project_name, donor_id, sum_activity_amount, activities',
      (q) => q.order('grant_id', { ascending: true })
    )

    // Get unique grants (group by grant_id and donor_name)
    const uniqueGrants = new Map<string, { 
      grant_id: string; 
      donor_name: string; 
      project_name: string | null; 
      donor_id: string | null; 
      included: number;
      activitySerials: string[];
    }>()
    
    for (const grant of grants) {
      const key = `${grant.grant_id}|${grant.donor_name}`
      const activitySerials = grant.activities 
        ? grant.activities.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
      
      if (!uniqueGrants.has(key)) {
        uniqueGrants.set(key, {
          grant_id: grant.grant_id,
          donor_name: grant.donor_name || 'Unknown',
          project_name: grant.project_name || grant.grant_id,
          donor_id: grant.donor_id || null,
          included: grant.sum_activity_amount || 0,
          activitySerials
        })
      } else {
        // If duplicate, sum the amounts and merge activity serials
        const existing = uniqueGrants.get(key)!
        existing.included += (grant.sum_activity_amount || 0)
        // Merge activity serials (avoid duplicates)
        const newSerials = activitySerials.filter(s => !existing.activitySerials.includes(s))
        existing.activitySerials.push(...newSerials)
      }
    }

    // Fetch all projects to calculate committed and pending
    const projects = await fetchAllRows(
      supabase,
      'err_projects',
      'expenses, funding_status, grant_id'
    )

    const sumExpenses = (rows: any[]) => rows.reduce((sum, p) => {
      try {
        const exps = typeof p.expenses === 'string' ? JSON.parse(p.expenses) : p.expenses
        return sum + (exps || []).reduce((s2: number, e: any) => s2 + (e.total_cost || 0), 0)
      } catch { return sum }
    }, 0)

    // Build a map of project serial to grant key for quick lookup
    const projectSerialToGrantKey = new Map<string, string>()
    for (const [grantKey, grant] of uniqueGrants.entries()) {
      for (const serial of grant.activitySerials) {
        projectSerialToGrantKey.set(serial, grantKey)
      }
    }

    // Calculate committed and pending by grant key
    const byGrantCommitted = new Map<string, number>()
    const byGrantPending = new Map<string, number>()
    
    for (const p of projects) {
      if (!p.grant_id) continue // Only count projects assigned to a grant
      
      // Find which grant this project belongs to by checking if its grant_id (serial) is in any grant's activities
      const grantKey = projectSerialToGrantKey.get(p.grant_id)
      if (!grantKey) continue // Project serial not found in any grant's activities
      
      const amt = sumExpenses([p])
      if (p.funding_status === 'committed') {
        byGrantCommitted.set(grantKey, (byGrantCommitted.get(grantKey) || 0) + amt)
      }
      // Pending = assigned to grant but not yet committed
      if (p.funding_status !== 'committed') {
        byGrantPending.set(grantKey, (byGrantPending.get(grantKey) || 0) + amt)
      }
    }

    // Build result rows
    const rows = Array.from(uniqueGrants.entries()).map(([grantKey, grant]) => {
      const committed = byGrantCommitted.get(grantKey) || 0
      const pending = byGrantPending.get(grantKey) || 0
      const remaining = grant.included - committed - pending
      return {
        donor_id: grant.donor_id,
        donor_name: grant.donor_name,
        grant_id: grant.grant_id,
        grant_call_name: grant.project_name || grant.grant_id,
        included: grant.included,
        committed,
        pending,
        remaining
      }
    })

    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Pool by-donor error:', error)
    return NextResponse.json({ error: 'Failed to compute by-donor' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}


