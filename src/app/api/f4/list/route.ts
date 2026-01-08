import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'

export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()
    
    // Get user's state access rights
    const { allowedStateNames } = await getUserStateAccess()
    
    // First, get allowed project IDs if state filtering is needed
    let allowedProjectIds: string[] | null = null
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      const { data: allowedProjects } = await supabase
        .from('err_projects')
        .select('id')
        .in('state', allowedStateNames)
      allowedProjectIds = (allowedProjects || []).map((p: any) => p.id)
      if (allowedProjectIds.length === 0) {
        // No projects in allowed states, return empty
        return NextResponse.json([])
      }
    }
    
    // Get F4 summaries with attachment counts and project/room/grant context
    // First, get portal projects only (exclude historical projects)
    let query = supabase
      .from('err_summary')
      .select(`
        id,
        project_id,
        activities_raw_import_id,
        report_date,
        total_grant,
        total_expenses,
        remainder,
        created_at,
        err_projects (
          err_id,
          state,
          grant_call_id,
          emergency_rooms ( name, name_ar, err_code ),
          grant_calls ( name, shortname, donors ( name, short_name ) )
        )
      `)
      .is('activities_raw_import_id', null) // Only portal projects
      .order('created_at', { ascending: false })
    
    // Filter by allowed project IDs if state filtering is needed
    if (allowedProjectIds !== null) {
      query = query.in('project_id', allowedProjectIds)
    }
    
    const { data: summaries, error } = await query
    if (error) throw error

    // Get historical F4 reports (those with activities_raw_import_id)
    // Exclude summaries that also have project_id to prevent duplicates
    let historicalQuery = supabase
      .from('err_summary')
      .select(`
        id,
        project_id,
        activities_raw_import_id,
        report_date,
        total_grant,
        total_expenses,
        remainder,
        created_at,
        activities_raw_import (
          id,
          "ERR CODE",
          "ERR Name",
          "State",
          "Project Donor"
        )
      `)
      .not('activities_raw_import_id', 'is', null) // Only historical projects
      .is('project_id', null) // Exclude summaries that also have project_id
      .order('created_at', { ascending: false })
    
    const { data: historicalSummaries } = await historicalQuery
    
    // Filter historical summaries by state if needed
    let filteredHistorical = historicalSummaries || []
    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      filteredHistorical = (historicalSummaries || []).filter((s: any) => {
        const state = s.activities_raw_import?.['State']
        return state && allowedStateNames.includes(state)
      })
    }
    
    // Combine portal and historical summaries
    // Deduplicate by summary ID to prevent counting the same summary twice
    const allSummariesMap = new Map<number, any>()
    for (const s of (summaries || [])) {
      if (s.id) allSummariesMap.set(s.id, s)
    }
    for (const s of filteredHistorical) {
      if (s.id) allSummariesMap.set(s.id, s)
    }
    const allSummaries = Array.from(allSummariesMap.values())
    
    // Get attachment counts
    const ids = allSummaries.map((s: any) => s.id)
    let attachCounts: Record<number, number> = {}
    if (ids.length) {
      const { data: atts } = await supabase
        .from('err_summary_attachments')
        .select('summary_id')
        .in('summary_id', ids)
      for (const a of (atts || [])) {
        attachCounts[a.summary_id] = (attachCounts[a.summary_id] || 0) + 1
      }
    }

    // Map summaries to response format
    const rows = allSummaries.map((s: any) => {
      if (s.activities_raw_import_id) {
        // Historical project
        const hist = s.activities_raw_import || {}
        return {
          id: s.id,
          project_id: `historical_${s.activities_raw_import_id}`,
          activities_raw_import_id: s.activities_raw_import_id,
          err_id: hist['ERR CODE'] || hist['ERR Name'] || null,
          err_name: hist['ERR CODE'] || hist['ERR Name'] || null,
          state: hist['State'] || null,
          grant_call: null,
          donor: hist['Project Donor'] || null,
          report_date: s.report_date,
          total_grant: s.total_grant,
          total_expenses: s.total_expenses,
          remainder: s.remainder,
          attachments_count: attachCounts[s.id] || 0,
          updated_at: s.created_at
        }
      } else {
        // Portal project
        const prj = s.err_projects || {}
        const room = prj.emergency_rooms || {}
        const gc = prj.grant_calls || {}
        const donor = gc.donors || {}
        const errName = room.name || room.name_ar || prj.err_id || null
        return {
          id: s.id,
          project_id: s.project_id,
          activities_raw_import_id: null,
          err_id: prj?.err_id || null,
          err_name: errName,
          state: prj?.state || null,
          grant_call: gc?.name || gc?.shortname || null,
          donor: donor?.short_name || donor?.name || null,
          report_date: s.report_date,
          total_grant: s.total_grant,
          total_expenses: s.total_expenses,
          remainder: s.remainder,
          attachments_count: attachCounts[s.id] || 0,
          updated_at: s.created_at
        }
      }
    })

    return NextResponse.json(rows)
  } catch (e) {
    console.error('F4 list error', e)
    return NextResponse.json({ error: 'Failed to fetch F4 list' }, { status: 500 })
  }
}


