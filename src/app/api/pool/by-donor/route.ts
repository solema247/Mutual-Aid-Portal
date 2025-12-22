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
    const grants = await fetchAllRows<{
      grant_id: string | null;
      donor_name: string | null;
      project_name: string | null;
      donor_id: string | null;
      sum_activity_amount: number | null;
      activities: string | null;
    }>(
      supabase,
      'grants_grid_view',
      'grant_id, donor_name, project_name, donor_id, sum_activity_amount, activities',
      (q) => q.order('grant_id', { ascending: true })
    )

    // Get unique grants (group by grant_id only)
    const uniqueGrants = new Map<string, { 
      grant_id: string; 
      donor_name: string; 
      project_name: string | null; 
      donor_id: string | null; 
      included: number;
      activitySerials: string[];
    }>()
    
    for (const grant of grants) {
      // Skip if grant_id is null or empty
      if (!grant.grant_id || grant.grant_id.trim() === '') continue
      
      const key = grant.grant_id.trim() // Group by grant_id only (normalized)
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
        // If duplicate grant_id, sum the amounts and merge activity serials
        const existing = uniqueGrants.get(key)!
        existing.included += (grant.sum_activity_amount || 0)
        // Merge activity serials (avoid duplicates)
        const newSerials = activitySerials.filter(s => !existing.activitySerials.includes(s))
        existing.activitySerials.push(...newSerials)
        // Keep the first donor_name encountered (or update if needed)
        // For now, keep the first one
      }
    }

    // Fetch historical data from activities_raw_import
    const historicalData = await fetchAllRows<{
      'Project Donor'?: string | null;
      project_donor?: string | null;
      USD?: number | null;
      usd?: number | null;
    }>(
      supabase,
      'activities_raw_import',
      '"Project Donor",USD'
    )

    // Calculate historical by grant_id (matching Project Donor to grant_id)
    const byGrantHistorical = new Map<string, number>()
    for (const row of historicalData || []) {
      const rawDonor = row['Project Donor'] || row['project_donor'] || row['Project Donor']
      const rawUSD = row['USD'] || row['usd'] || row.USD
      
      if (!rawDonor) continue
      
      const grantId = String(rawDonor).trim()
      if (!grantId) continue
      
      let usd = 0
      if (rawUSD !== null && rawUSD !== undefined) {
        usd = Number(rawUSD)
        if (isNaN(usd) || usd === 0) continue
      } else {
        continue
      }
      
      // Use normalized grant_id (same as grouping key)
      byGrantHistorical.set(grantId, (byGrantHistorical.get(grantId) || 0) + usd)
    }

    // Fetch all projects to calculate assigned
    const projects = await fetchAllRows<{
      expenses: any;
      funding_status: string | null;
      grant_id: string | null;
    }>(
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

    // Build a map of project serial to grant_id for quick lookup
    const projectSerialToGrantId = new Map<string, string>()
    for (const [grantId, grant] of uniqueGrants.entries()) {
      for (const serial of grant.activitySerials) {
        projectSerialToGrantId.set(serial, grantId)
      }
    }

    // Calculate assigned by grant_id (projects assigned to a grant after MOU)
    const byGrantAssigned = new Map<string, number>()
    
    for (const p of projects) {
      if (!p.grant_id) continue // Only count projects assigned to a grant
      
      // Find which grant this project belongs to by checking if its grant_id (serial) is in any grant's activities
      const grantId = projectSerialToGrantId.get(p.grant_id)
      if (!grantId) continue // Project serial not found in any grant's activities
      
      // Only count projects that are assigned (have a grant_id that matches a serial in activities)
      // This means they've been assigned after MOU
      const amt = sumExpenses([p])
      byGrantAssigned.set(grantId, (byGrantAssigned.get(grantId) || 0) + amt)
    }

    // Build result rows (grouped by grant_id only)
    const rows = Array.from(uniqueGrants.entries())
      .map(([grantId, grant]) => {
        const assigned = byGrantAssigned.get(grantId) || 0
        const historical = byGrantHistorical.get(grantId) || 0
        const remaining = grant.included - historical - assigned
        return {
          donor_id: grant.donor_id,
          donor_name: grant.donor_name,
          grant_id: grant.grant_id,
          grant_call_name: grant.project_name || grant.grant_id,
          included: grant.included,
          historical,
          assigned,
          remaining
        }
      })
      .sort((a, b) => (a.grant_id || '').localeCompare(b.grant_id || ''))

    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  } catch (error) {
    console.error('Pool by-donor error:', error)
    return NextResponse.json({ error: 'Failed to compute by-donor' }, { status: 500, headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } })
  }
}


