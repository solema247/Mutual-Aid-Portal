'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { RefreshCw, ChevronRight, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabaseClient'
import ProjectDetailModal from './ProjectDetailModal'
import UploadF4Modal from '@/app/err-portal/f4-f5-reporting/components/UploadF4Modal'
import UploadF5Modal from '@/app/err-portal/f4-f5-reporting/components/UploadF5Modal'
import ViewF4Modal from '@/app/err-portal/f4-f5-reporting/components/ViewF4Modal'
import ViewF5Modal from '@/app/err-portal/f4-f5-reporting/components/ViewF5Modal'

export default function ProjectManagement() {
  const { t } = useTranslation(['projects', 'common'])

  const [loading, setLoading] = useState(false)
  const [kpis, setKpis] = useState<any>({})
  const [rows, setRows] = useState<any[]>([])
  const [allRows, setAllRows] = useState<any[]>([]) // Store all rows before filtering

  // Grant filter state
  const [selectedGrantId, setSelectedGrantId] = useState<string>('all')
  const [grants, setGrants] = useState<Array<{ id: string; grant_id: string; donor_name: string; project_name: string | null }>>([])
  
  // Grant Serial search state
  const [grantSerialSearch, setGrantSerialSearch] = useState<string>('')
  const grantSerialSearchRef = useRef<HTMLInputElement>(null)
  const shouldSelectAllRef = useRef<boolean>(false)

  // Drill-down state
  const [level, setLevel] = useState<'state'|'room'|'project'>('state')
  const [selectedStateName, setSelectedStateName] = useState<string>('')
  const [selectedErrId, setSelectedErrId] = useState<string>('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null)
  
  // F4/F5 modals state
  const [uploadF4Open, setUploadF4Open] = useState(false)
  const [uploadF5Open, setUploadF5Open] = useState(false)
  const [viewF4Open, setViewF4Open] = useState(false)
  const [viewF5Open, setViewF5Open] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedF4Id, setSelectedF4Id] = useState<number | null>(null)
  const [selectedF5Id, setSelectedF5Id] = useState<string | null>(null)
  const [f4ListOpen, setF4ListOpen] = useState(false)
  const [f5ListOpen, setF5ListOpen] = useState(false)
  const [f4Reports, setF4Reports] = useState<any[]>([])
  const [f5Reports, setF5Reports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(false)
  // Store portal F4/F5 counts per project (for historical projects, only count portal uploads)
  const [portalF4Counts, setPortalF4Counts] = useState<Record<string, number>>({})
  const [portalF5Counts, setPortalF5Counts] = useState<Record<string, number>>({})
  const [completingProjectId, setCompletingProjectId] = useState<string | null>(null)

  const loadRollup = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/overview/rollup`)
      const j = await res.json()
      setKpis(j.kpis || {})
      setAllRows(j.rows || [])
      setRows(j.rows || [])
      
      // Load portal F4 and F5 counts for all projects
      await loadPortalReportCounts()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadPortalReportCounts = async () => {
    try {
      // Fetch F4 reports
      const f4Res = await fetch('/api/f4/list')
      const f4Data = await f4Res.json()
      
      // Fetch F5 reports
      const f5Res = await fetch('/api/f5/list')
      const f5Data = await f5Res.json()
      
      // Build counts map: project_id -> count
      const f4Counts: Record<string, number> = {}
      const f5Counts: Record<string, number> = {}
      
      // Count F4 reports by project_id or activities_raw_import_id
      // Use a Set to track which F4 IDs we've already counted to prevent duplicates
      const countedF4Ids = new Set<number>()
      for (const f4 of (f4Data || [])) {
        // Skip if we've already counted this F4 (by its id)
        if (f4.id && countedF4Ids.has(f4.id)) continue
        
        // Count for portal project if it has project_id (and no activities_raw_import_id, though query should prevent this)
        if (f4.project_id && !f4.activities_raw_import_id) {
          f4Counts[f4.project_id] = (f4Counts[f4.project_id] || 0) + 1
          if (f4.id) countedF4Ids.add(f4.id)
        }
        // Count for historical project if it has activities_raw_import_id (and no project_id, though query should prevent this)
        else if (f4.activities_raw_import_id && !f4.project_id) {
          const historicalId = `historical_${f4.activities_raw_import_id}`
          f4Counts[historicalId] = (f4Counts[historicalId] || 0) + 1
          if (f4.id) countedF4Ids.add(f4.id)
        }
        // If somehow both are set (shouldn't happen with query filters, but handle gracefully)
        else if (f4.project_id && f4.activities_raw_import_id) {
          // Count only for portal project to avoid double counting
          f4Counts[f4.project_id] = (f4Counts[f4.project_id] || 0) + 1
          if (f4.id) countedF4Ids.add(f4.id)
        }
      }
      
      // Count F5 reports by project_id (F5 doesn't support historical projects yet)
      for (const f5 of (f5Data || [])) {
        if (f5.project_id) {
          f5Counts[f5.project_id] = (f5Counts[f5.project_id] || 0) + 1
        }
      }
      
      setPortalF4Counts(f4Counts)
      setPortalF5Counts(f5Counts)
    } catch (e) {
      console.error('Failed to load portal report counts', e)
    }
  }

  const fetchGrants = async () => {
    try {
      const { data, error } = await supabase
        .from('grants_grid_view')
        .select('id, grant_id, donor_name, project_name')
        .order('grant_id', { ascending: true })
      
      if (error) throw error
      
      // Get unique grants (group by grant_id and donor_name)
      const uniqueGrants = new Map<string, { id: string; grant_id: string; donor_name: string; project_name: string | null }>()
      ;(data || []).forEach((grant: any) => {
        const key = `${grant.grant_id}|${grant.donor_name}`
        if (!uniqueGrants.has(key)) {
          uniqueGrants.set(key, {
            id: grant.id,
            grant_id: grant.grant_id,
            donor_name: grant.donor_name,
            project_name: grant.project_name || null
          })
        }
      })
      
      setGrants(Array.from(uniqueGrants.values()))
    } catch (error) {
      console.error('Error fetching grants:', error)
    }
  }

  useEffect(() => {
    fetchGrants()
  }, [])

  const handleRefresh = async () => {
    await loadRollup()
  }

  useEffect(() => {
    loadRollup()
  }, [])

  // Filter rows by grant and grant serial search
  useEffect(() => {
    let filtered = allRows
    
    // First apply grant filter
    if (selectedGrantId === 'all') {
      filtered = allRows
    } else if (selectedGrantId === 'unassigned') {
      // Show only current projects with null grant_grid_id
      filtered = allRows.filter((r: any) => !r.is_historical && !r.grant_grid_id)
    } else {
      // Filter by selected grant
      const selectedGrant = grants.find(g => g.id === selectedGrantId)
      if (selectedGrant) {
        filtered = allRows.filter((r: any) => {
          if (r.is_historical) {
            // Historical projects: filter by project_donor matching grant_id (text comparison)
            const projectDonor = r.project_donor ? String(r.project_donor).trim() : null
            const grantId = selectedGrant.grant_id ? String(selectedGrant.grant_id).trim() : null
            return projectDonor === grantId
          } else {
            // Current projects: filter by grant_grid_id matching grant's id
            return r.grant_grid_id === selectedGrant.id
          }
        })
      } else {
        filtered = allRows
      }
    }
    
    // Then apply grant serial search filter if provided
    if (grantSerialSearch.trim()) {
      const searchTerm = grantSerialSearch.trim().toLowerCase()
      filtered = filtered.filter((r: any) => {
        const grantSerial = r.grant_serial_id ? String(r.grant_serial_id).toLowerCase().trim() : ''
        if (!grantSerial) return false
        // Use startsWith for flexible but precise matching
        // "LCC-P2H-JA-1224-0001-319" will match that exact serial
        // "LCC-P2H-JA-1224" will match all JA projects starting with that prefix
        // But "LCC-P2H-JA-1224-0001-319" will NOT match "LCC-P2H-KA-1224-0001-220"
        return grantSerial.startsWith(searchTerm)
      })
    }
    
    setRows(filtered)
  }, [selectedGrantId, allRows, grants, grantSerialSearch])

  // Project-level counters for the current filtered slice
  const counters = useMemo(() => {
    const total = (rows || []).length
    const withMou = (rows || []).filter((r:any) => !!r.has_mou).length
    const withF4 = (rows || []).filter((r:any) => Number(r.f4_count || 0) > 0).length
    const withF5 = (rows || []).filter((r:any) => Number(r.f5_count || 0) > 0).length
    const pctF4 = total > 0 ? (withF4 / total) : 0
    const pctF5 = total > 0 ? (withF5 / total) : 0
    return { total, withMou, withF4, withF5, pctF4, pctF5 }
  }, [rows])

  // Grant-level summary rows (aggregate allRows by grant; used for "Summary by Grant" table)
  const grantSummaryRows = useMemo(() => {
    const out: Array<{ grantLabel: string; plan: number; actual: number; variance: number; burn: number; f4_count: number; f5_count: number; total_projects: number; projects_with_f4: number; projects_with_f5: number }> = []
    // Unassigned: current projects with no grant_grid_id
    const unassignedRows = (allRows || []).filter((r: any) => !r.is_historical && !r.grant_grid_id)
    if (unassignedRows.length > 0) {
      const plan = unassignedRows.reduce((s: number, r: any) => s + (Number(r.plan) || 0), 0)
      const actual = unassignedRows.reduce((s: number, r: any) => s + (Number(r.actual) || 0), 0)
      out.push({
        grantLabel: 'Unassigned',
        plan,
        actual,
        variance: plan - actual,
        burn: plan > 0 ? actual / plan : 0,
        f4_count: unassignedRows.reduce((s: number, r: any) => s + (Number(r.f4_count) || 0), 0),
        f5_count: unassignedRows.reduce((s: number, r: any) => s + (Number(r.f5_count) || 0), 0),
        total_projects: unassignedRows.length,
        projects_with_f4: unassignedRows.filter((r: any) => Number(r.f4_count || 0) > 0).length,
        projects_with_f5: unassignedRows.filter((r: any) => Number(r.f5_count || 0) > 0).length
      })
    }
    // One row per grant from grants list
    for (const grant of grants) {
      const grantRows = (allRows || []).filter((r: any) => {
        if (r.is_historical) {
          const projectDonor = (r.project_donor != null ? String(r.project_donor).trim() : '') || ''
          const grantId = (grant.grant_id != null ? String(grant.grant_id).trim() : '') || ''
          return projectDonor === grantId
        }
        return r.grant_grid_id === grant.id
      })
      if (grantRows.length === 0) continue
      const plan = grantRows.reduce((s: number, r: any) => s + (Number(r.plan) || 0), 0)
      const actual = grantRows.reduce((s: number, r: any) => s + (Number(r.actual) || 0), 0)
      out.push({
        grantLabel: `${grant.grant_id} - ${grant.project_name || grant.grant_id} (${grant.donor_name})`,
        plan,
        actual,
        variance: plan - actual,
        burn: plan > 0 ? actual / plan : 0,
        f4_count: grantRows.reduce((s: number, r: any) => s + (Number(r.f4_count) || 0), 0),
        f5_count: grantRows.reduce((s: number, r: any) => s + (Number(r.f5_count) || 0), 0),
        total_projects: grantRows.length,
        projects_with_f4: grantRows.filter((r: any) => Number(r.f4_count || 0) > 0).length,
        projects_with_f5: grantRows.filter((r: any) => Number(r.f5_count || 0) > 0).length
      })
    }
    return out.sort((a, b) => (a.grantLabel === 'Unassigned' ? -1 : b.grantLabel === 'Unassigned' ? 1 : a.grantLabel.localeCompare(b.grantLabel)))
  }, [allRows, grants])

  // Aggregations for drill-down
  const stateRows = useMemo(() => {
    const byState = new Map<string, { state: string; plan: number; actual: number; variance: number; burn: number; f4_count: number; f5_count: number; total_projects: number; projects_with_f4: number; projects_with_f5: number; last_report_date: string | null; last_f5_date: string | null }>()
    for (const r of rows) {
      const key = r.state || '—'
      const curr = byState.get(key) || { state: key, plan: 0, actual: 0, variance: 0, burn: 0, f4_count: 0, f5_count: 0, total_projects: 0, projects_with_f4: 0, projects_with_f5: 0, last_report_date: null as string | null, last_f5_date: null as string | null }
      curr.plan += Number(r.plan || 0)
      curr.actual += Number(r.actual || 0)
      curr.variance = curr.plan - curr.actual
      curr.f4_count += Number(r.f4_count || 0)
      curr.f5_count += Number(r.f5_count || 0)
      curr.total_projects += 1
      if (Number(r.f4_count || 0) > 0) curr.projects_with_f4 += 1
      if (Number(r.f5_count || 0) > 0) curr.projects_with_f5 += 1
      const last = curr.last_report_date
      const cand = r.last_report_date || null
      curr.last_report_date = !last ? cand : (!cand ? last : (new Date(last) > new Date(cand) ? last : cand))
      const lastF5 = curr.last_f5_date
      const candF5 = r.last_f5_date || null
      curr.last_f5_date = !lastF5 ? candF5 : (!candF5 ? lastF5 : (new Date(lastF5) > new Date(candF5) ? lastF5 : candF5))
      byState.set(key, curr)
    }
    // compute burn and sort alphabetically by state
    return Array.from(byState.values())
      .map(v => ({ ...v, burn: v.plan > 0 ? v.actual / v.plan : 0 }))
      .sort((a, b) => (a.state || '').localeCompare(b.state || ''))
  }, [rows])

  const roomRows = useMemo(() => {
    if (!selectedStateName) return [] as any[]
    const filtered = rows.filter((r:any) => r.state === selectedStateName)
    const byRoom = new Map<string, { err_id: string; state: string; plan: number; actual: number; variance: number; burn: number; f4_count: number; f5_count: number; total_projects: number; projects_with_f4: number; projects_with_f5: number; last_report_date: string | null; last_f5_date: string | null }>()
    for (const r of filtered) {
      const key = r.err_id || '—'
      const curr = byRoom.get(key) || { err_id: key, state: selectedStateName, plan: 0, actual: 0, variance: 0, burn: 0, f4_count: 0, f5_count: 0, total_projects: 0, projects_with_f4: 0, projects_with_f5: 0, last_report_date: null as string | null, last_f5_date: null as string | null }
      curr.plan += Number(r.plan || 0)
      curr.actual += Number(r.actual || 0)
      curr.variance = curr.plan - curr.actual
      curr.f4_count += Number(r.f4_count || 0)
      curr.f5_count += Number(r.f5_count || 0)
      curr.total_projects += 1
      if (Number(r.f4_count || 0) > 0) curr.projects_with_f4 += 1
      if (Number(r.f5_count || 0) > 0) curr.projects_with_f5 += 1
      const last = curr.last_report_date
      const cand = r.last_report_date || null
      curr.last_report_date = !last ? cand : (!cand ? last : (new Date(last) > new Date(cand) ? last : cand))
      const lastF5 = curr.last_f5_date
      const candF5 = r.last_f5_date || null
      curr.last_f5_date = !lastF5 ? candF5 : (!candF5 ? lastF5 : (new Date(lastF5) > new Date(candF5) ? lastF5 : candF5))
      byRoom.set(key, curr)
    }
    return Array.from(byRoom.values()).map(v => ({ ...v, burn: v.plan > 0 ? v.actual / v.plan : 0 }))
  }, [rows, selectedStateName])

  const projectRows = useMemo(() => {
    if (!selectedStateName || !selectedErrId) return [] as any[]
    return rows.filter((r:any)=> r.state === selectedStateName && (r.err_id || '—') === selectedErrId)
  }, [rows, selectedStateName, selectedErrId])

  // When searching by Grant Serial, show all matching projects directly
  const searchRows = useMemo(() => {
    if (!grantSerialSearch.trim()) return null
    // Return all rows that match the search (already filtered in the useEffect)
    // Deduplicate by project_id to avoid showing the same project twice
    const seen = new Set<string>()
    return rows.filter((r: any) => {
      const key = r.project_id || `${r.err_id}-${r.state}-${r.grant_serial_id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [rows, grantSerialSearch])

  // Auto-switch to project level when searching, reset to state level when search is cleared
  useEffect(() => {
    if (grantSerialSearch.trim()) {
      // When searching, switch to project level
      if (level !== 'project') {
        setLevel('project')
        setSelectedStateName('')
        setSelectedErrId('')
      }
    } else {
      // When search is cleared, only reset if we're currently in search mode (project level due to search)
      // Don't reset if user is drilling down normally
      // We can detect this by checking if we're at project level but have no selectedStateName/selectedErrId
      // This means we got here via search, not via drill-down
      if (level === 'project' && !selectedStateName && !selectedErrId) {
        setLevel('state')
        setSelectedStateName('')
        setSelectedErrId('')
      }
    }
  }, [grantSerialSearch]) // Removed 'level' from dependencies to prevent interference with drill-down

  // Inject styles to make text selection visible in the search input
  useEffect(() => {
    const styleId = 'grant-serial-search-selection-styles'
    // Remove existing style if present
    const existingStyle = document.getElementById(styleId)
    if (existingStyle) {
      existingStyle.remove()
    }

    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      /* Override Input component's selection styles with maximum specificity */
      input[data-slot="input"]#grant-serial-search::selection,
      input[data-slot="input"]#grant-serial-search::-moz-selection {
        background: rgb(191 219 254) !important;
        background-color: rgb(191 219 254) !important;
        color: rgb(30 58 138) !important;
        -webkit-text-fill-color: rgb(30 58 138) !important;
      }
      .dark input[data-slot="input"]#grant-serial-search::selection,
      .dark input[data-slot="input"]#grant-serial-search::-moz-selection {
        background: rgb(30 64 175) !important;
        background-color: rgb(30 64 175) !important;
        color: rgb(219 234 254) !important;
        -webkit-text-fill-color: rgb(219 234 254) !important;
      }
      /* Fallback for browsers that don't support data-slot selector */
      input#grant-serial-search::selection,
      input#grant-serial-search::-moz-selection {
        background: rgb(191 219 254) !important;
        background-color: rgb(191 219 254) !important;
        color: rgb(30 58 138) !important;
        -webkit-text-fill-color: rgb(30 58 138) !important;
      }
      .dark input#grant-serial-search::selection,
      .dark input#grant-serial-search::-moz-selection {
        background: rgb(30 64 175) !important;
        background-color: rgb(30 64 175) !important;
        color: rgb(219 234 254) !important;
        -webkit-text-fill-color: rgb(219 234 254) !important;
      }
    `
    document.head.appendChild(style)

    return () => {
      const styleToRemove = document.getElementById(styleId)
      if (styleToRemove) {
        styleToRemove.remove()
      }
    }
  }, [])

  const displayed = searchRows ? searchRows : (level === 'state' ? stateRows : (level === 'room' ? roomRows : projectRows))

  // Calculate totals for the displayed rows
  const totals = useMemo(() => {
    if (!displayed || displayed.length === 0) {
      return {
        plan: 0,
        actual: 0,
        variance: 0,
        burn: 0,
        f4_count: 0,
        f5_count: 0,
        total_projects: 0,
        projects_with_f4: 0,
        projects_with_f5: 0
      }
    }
    const totalPlan = displayed.reduce((sum, r) => sum + (Number(r.plan || 0)), 0)
    const totalActual = displayed.reduce((sum, r) => sum + (Number(r.actual || 0)), 0)
    const totalVariance = totalPlan - totalActual
    const totalBurn = totalPlan > 0 ? totalActual / totalPlan : 0
    const totalF4 = displayed.reduce((sum, r) => sum + (Number(r.f4_count || 0)), 0)
    const totalF5 = displayed.reduce((sum, r) => sum + (Number(r.f5_count || 0)), 0)
    const totalProjects = displayed.reduce((sum, r) => sum + (Number(r.total_projects || 1)), 0)
    const projectsWithF4 = displayed.reduce((sum, r) => sum + (Number(r.projects_with_f4 || (Number(r.f4_count || 0) > 0 ? 1 : 0))), 0)
    const projectsWithF5 = displayed.reduce((sum, r) => sum + (Number(r.projects_with_f5 || (Number(r.f5_count || 0) > 0 ? 1 : 0))), 0)
    
    return {
      plan: totalPlan,
      actual: totalActual,
      variance: totalVariance,
      burn: totalBurn,
      f4_count: totalF4,
      f5_count: totalF5,
      total_projects: totalProjects,
      projects_with_f4: projectsWithF4,
      projects_with_f5: projectsWithF5
    }
  }, [displayed])

  const onRowClick = (r: any) => {
    // If searching, always open detail modal (projects are shown directly)
    if (grantSerialSearch.trim()) {
      setDetailProjectId(r.project_id || null)
      setDetailOpen(true)
      return
    }
    
    if (level === 'state') {
      const newState = r.state || '—'
      setSelectedStateName(newState)
      setLevel('room')
    } else if (level === 'room') {
      const newErrId = r.err_id || '—'
      setSelectedErrId(newErrId)
      setLevel('project')
    } else if (level === 'project') {
      setDetailProjectId(r.project_id || null)
      setDetailOpen(true)
    }
  }

  const goBack = () => {
    if (level === 'project') {
      setLevel('room')
      setSelectedErrId('')
    } else if (level === 'room') {
      setLevel('state')
      setSelectedStateName('')
    }
  }

  const handleCompleteProject = async (projectId: string) => {
    if (!projectId || projectId.startsWith('historical_')) return
    
    if (!confirm('Are you sure you want to mark this project as completed?')) {
      return
    }

    try {
      setCompletingProjectId(projectId)
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to complete project')
      }

      // Refresh the data to show updated status
      await loadRollup()
    } catch (error: any) {
      console.error('Error completing project:', error)
      alert(error.message || 'Failed to complete project')
    } finally {
      setCompletingProjectId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* All Cards in 2 rows of 6 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* KPIs */}
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.kpis.plan')}</CardTitle>
            <span className="text-sm font-semibold">${Number(kpis.plan||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.kpis.plan_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.kpis.actuals')}</CardTitle>
            <span className="text-sm font-semibold">${Number(kpis.actual||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.kpis.actuals_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.kpis.variance')}</CardTitle>
            <span className="text-sm font-semibold">${Number(kpis.variance||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.kpis.variance_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.kpis.burn')}</CardTitle>
            <span className="text-sm font-semibold">{kpis.burn ? (kpis.burn*100).toFixed(0)+'%' : '0%'}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.kpis.burn_desc')}</div>
        </Card>
        {/* Project Counters */}
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.projects')}</CardTitle>
            <span className="text-sm font-semibold">{Number(counters.total||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.projects_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.with_mous')}</CardTitle>
            <span className="text-sm font-semibold">{Number(counters.withMou||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.with_mous_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.with_f4s')}</CardTitle>
            <span className="text-sm font-semibold">{Number(counters.withF4||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.with_f4s_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.f4_complete')}</CardTitle>
            <span className="text-sm font-semibold">{(counters.pctF4*100).toFixed(0)}%</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.f4_complete_desc')}</div>
        </Card>
        {/* F5 Program Reporting Cards */}
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.with_f5s')}</CardTitle>
            <span className="text-sm font-semibold">{Number(counters.withF5||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.with_f5s_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.f5_complete')}</CardTitle>
            <span className="text-sm font-semibold">{(counters.pctF5*100).toFixed(0)}%</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.f5_complete_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.total_individuals')}</CardTitle>
            <span className="text-sm font-semibold">{Number(kpis.f5_total_individuals||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.total_individuals_desc')}</div>
        </Card>
        <Card className="p-1.5 mx-1">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <CardTitle className="text-sm leading-tight font-semibold">{t('management.counters.total_families')}</CardTitle>
            <span className="text-sm font-semibold">{Number(kpis.f5_total_families||0).toLocaleString()}</span>
          </div>
          <div className="text-xs text-muted-foreground leading-tight">{t('management.counters.total_families_desc')}</div>
        </Card>
      </div>

      {/* Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  {t('management.table.title')}
                  {level !== 'state' && (
                    <Button variant="outline" size="sm" onClick={goBack}>{t('management.table.back')}</Button>
                  )}
                  {level === 'room' && selectedStateName ? (
                    <span className="ml-2 text-sm text-muted-foreground">{t('management.table.state')}: {selectedStateName}</span>
                  ) : null}
                  {level === 'project' && selectedErrId ? (
                    <span className="ml-2 text-sm text-muted-foreground">{t('management.table.state')}: {selectedStateName} · {t('management.table.err')}: {selectedErrId}</span>
                  ) : null}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
                  {t('common:refresh')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
          {/* Grant Filter and Search */}
          <div className="mb-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="grant-filter" className="text-sm font-medium">Filter by Grant:</Label>
              <Select value={selectedGrantId} onValueChange={setSelectedGrantId}>
                <SelectTrigger id="grant-filter" className="w-[300px]">
                  <SelectValue placeholder="All Grants" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Grants</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {grants.map((grant) => (
                    <SelectItem key={grant.id} value={grant.id}>
                      {grant.grant_id} - {grant.project_name || grant.grant_id} ({grant.donor_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="grant-serial-search" className="text-sm font-medium">Search by Grant Serial:</Label>
              <Input
                ref={grantSerialSearchRef}
                id="grant-serial-search"
                type="text"
                placeholder="Enter grant serial..."
                value={grantSerialSearch}
                onChange={(e) => {
                  setGrantSerialSearch(e.target.value)
                  shouldSelectAllRef.current = false
                }}
                onFocus={(e) => {
                  shouldSelectAllRef.current = true
                  // Use requestAnimationFrame to ensure selection happens after all events
                  requestAnimationFrame(() => {
                    if (shouldSelectAllRef.current && grantSerialSearchRef.current) {
                      grantSerialSearchRef.current.select()
                    }
                  })
                }}
                onMouseDown={(e) => {
                  // If we're about to select all, prevent default to keep selection
                  if (shouldSelectAllRef.current && e.currentTarget === document.activeElement) {
                    e.preventDefault()
                    requestAnimationFrame(() => {
                      if (grantSerialSearchRef.current) {
                        grantSerialSearchRef.current.select()
                      }
                    })
                  }
                }}
                onClick={(e) => {
                  // If input is focused and we want to select all, do it
                  if (shouldSelectAllRef.current && e.currentTarget === document.activeElement) {
                    requestAnimationFrame(() => {
                      if (grantSerialSearchRef.current) {
                        grantSerialSearchRef.current.select()
                      }
                    })
                  }
                }}
                onDoubleClick={(e) => {
                  // Double click should select all
                  e.currentTarget.select()
                  shouldSelectAllRef.current = false
                }}
                className="w-[250px] select-text [&::selection]:!bg-blue-200 [&::selection]:!text-blue-900 dark:[&::selection]:!bg-blue-800 dark:[&::selection]:!text-blue-100"
              />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            {searchRows ? (
              <span>
                Showing projects matching Grant Serial search. {grantSerialSearch && <span className="font-medium text-foreground">Search: "{grantSerialSearch}"</span>}
              </span>
            ) : level === 'state' ? (
              <span>
                {t('management.table.tips.state')} 
                <span className="ml-2 font-medium text-foreground">→ Click a row to view ERR rooms</span>
              </span>
            ) : level === 'room' ? (
              <span>
                {t('management.table.tips.room')} 
                <span className="ml-2 font-medium text-foreground">→ Click a row to view projects</span>
              </span>
            ) : (
              t('management.table.tips.project')
            )}
          </div>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('management.table.loading')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                  {searchRows || level === 'project' ? (
                    <>
                      <TableHead>{t('management.table.err')}</TableHead>
                      <TableHead>{t('management.table.state')}</TableHead>
                      <TableHead>{t('management.table.mou')}</TableHead>
                      <TableHead>Grant Serial</TableHead>
                    </>
                  ) : level === 'state' ? (
                    <>
                      <TableHead>{t('management.table.state')}</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>{t('management.table.err')}</TableHead>
                      <TableHead>{t('management.table.state')}</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">{t('management.table.plan')}</TableHead>
                  <TableHead className="text-right">{t('management.table.actuals')}</TableHead>
                  <TableHead className="text-right">{t('management.table.variance')}</TableHead>
                  <TableHead className="text-right">{t('management.table.burn')}</TableHead>
                  <TableHead>{t('management.table.f4s')}</TableHead>
                  <TableHead>{t('management.table.f4_complete')}</TableHead>
                  <TableHead>{t('management.table.f5s')}</TableHead>
                  <TableHead>{t('management.table.f5_complete')}</TableHead>
                  {(searchRows || level === 'project') && <TableHead>{t('management.table.actions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {(displayed||[]).length===0 ? (
                  <TableRow><TableCell colSpan={(searchRows || level==='project')?13:(level==='room'?12:11)} className="text-center text-muted-foreground">{t('management.table.no_data')}</TableCell></TableRow>
                ) : (
                  <>
                    {/* Total Row */}
                    <TableRow className="bg-muted/50 font-semibold">
                      {searchRows || level === 'project' ? (
                        <>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                        </>
                      ) : level === 'state' ? (
                        <>
                          <TableCell className="font-semibold">Total</TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell></TableCell>
                        </>
                      )}
                      <TableCell className="text-right font-semibold">{Number(totals.plan || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(totals.actual || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(totals.variance || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{totals.burn ? (totals.burn * 100).toFixed(0) + '%' : '0%'}</TableCell>
                      <TableCell className="font-semibold">{totals.f4_count || 0}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {(searchRows || level === 'project')
                          ? (totals.f4_count > 0 ? '100%' : '0%')
                          : `${totals.total_projects > 0 ? Math.round((totals.projects_with_f4 / totals.total_projects) * 100) : 0}%`
                        }
                      </TableCell>
                      <TableCell className="font-semibold">{totals.f5_count || 0}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {(searchRows || level === 'project')
                          ? (totals.f5_count > 0 ? '100%' : '0%')
                          : `${totals.total_projects > 0 ? Math.round((totals.projects_with_f5 / totals.total_projects) * 100) : 0}%`
                        }
                      </TableCell>
                      {(searchRows || level === 'project') && <TableCell></TableCell>}
                    </TableRow>
                    {displayed.map((r:any, idx:number)=> (
                  <TableRow 
                    key={`${r.project_id || 'no-id'}-${r.err_id || 'no-err'}-${r.state || 'no-state'}-${idx}`}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50"
                    )}
                    onClick={() => onRowClick(r)}
                  >
                    {searchRows || level === 'project' ? (
                      <>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{r.err_id || '-'}</span>
                            {r.is_historical && (
                              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                Historical
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{r.state || '-'}</TableCell>
                        <TableCell>{r.has_mou ? (r.mou_code || 'Yes') : '-'}</TableCell>
                        <TableCell>{r.grant_serial_id || '-'}</TableCell>
                      </>
                    ) : level === 'state' ? (
                      <>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{r.state || '-'}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{r.err_id || '-'}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                        <TableCell>{r.state || '-'}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right">{Number(r.plan||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(r.actual||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(r.variance||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.burn ? (r.burn*100).toFixed(0)+'%' : '0%'}</TableCell>
                    <TableCell>{r.f4_count||0}</TableCell>
                    <TableCell className="text-right">
                      {level === 'project' 
                        ? (r.f4_count > 0 ? '100%' : '0%')
                        : `${r.total_projects > 0 ? Math.round((r.projects_with_f4 / r.total_projects) * 100) : 0}%`
                      }
                    </TableCell>
                    <TableCell>{r.f5_count||0}</TableCell>
                    <TableCell className="text-right">
                      {level === 'project' 
                        ? (r.f5_count > 0 ? '100%' : '0%')
                        : `${r.total_projects > 0 ? Math.round((r.projects_with_f5 / r.total_projects) * 100) : 0}%`
                      }
                    </TableCell>
                    {(searchRows || level === 'project') && (
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e)=>{ e.stopPropagation(); setDetailProjectId(r.project_id || null); setDetailOpen(true) }}
                            >{t('management.table.view')}</Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="bg-green-50 hover:bg-green-100"
                              onClick={async (e)=>{ 
                                e.stopPropagation(); 
                                const projectId = r.project_id || null;
                                // For historical projects, extract the real UUID
                                const actualProjectId = projectId && String(projectId).startsWith('historical_') 
                                  ? projectId // Keep the historical_ prefix for the modal to handle
                                  : projectId;
                                setSelectedProjectId(actualProjectId);
                                // Load existing F4 reports for this project
                                if (projectId) {
                                  setLoadingReports(true);
                                  try {
                                    const res = await fetch('/api/f4/list');
                                    const data = await res.json();
                                    // Check both project_id and activities_raw_import_id for historical projects
                                    const isHistorical = String(projectId).startsWith('historical_');
                                    const realUuid = isHistorical ? String(projectId).replace('historical_', '') : null;
                                    const projectF4s = (data || []).filter((f4: any) => {
                                      if (isHistorical && realUuid) {
                                        return f4.activities_raw_import_id === realUuid;
                                      }
                                      return f4.project_id === projectId;
                                    });
                                    setF4Reports(projectF4s);
                                    if (projectF4s.length > 0) {
                                      // If reports exist, show list (edit only)
                                      setF4ListOpen(true);
                                    } else {
                                      // If no reports, allow upload
                                      setUploadF4Open(true);
                                    }
                                  } catch (err) {
                                    console.error(err);
                                    setUploadF4Open(true);
                                  } finally {
                                    setLoadingReports(false);
                                  }
                                } else {
                                  setUploadF4Open(true);
                                }
                              }}
                            >F4 {(() => {
                              // For historical projects, only show count if there are portal uploads
                              if (r.is_historical) {
                                const portalCount = portalF4Counts[r.project_id] || 0
                                return portalCount > 0 ? `(${portalCount})` : ''
                              }
                              // For portal projects, use the count from rollup
                              return r.f4_count > 0 ? `(${r.f4_count})` : ''
                            })()}</Button>
                            {!r.is_historical && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-blue-50 hover:bg-blue-100"
                                onClick={async (e)=>{ 
                                  e.stopPropagation();
                                  const projectId = r.project_id || null;
                                  setSelectedProjectId(projectId);
                                  // Load existing F5 reports for this project
                                  if (projectId) {
                                    setLoadingReports(true);
                                    try {
                                      const res = await fetch('/api/f5/list');
                                      const data = await res.json();
                                      const projectF5s = (data || []).filter((f5: any) => f5.project_id === projectId);
                                      setF5Reports(projectF5s);
                                      if (projectF5s.length > 0) {
                                        // If reports exist, show list (edit only)
                                        setF5ListOpen(true);
                                      } else {
                                        // If no reports, allow upload
                                        setUploadF5Open(true);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      setUploadF5Open(true);
                                    } finally {
                                      setLoadingReports(false);
                                    }
                                  } else {
                                    setUploadF5Open(true);
                                  }
                                }}
                              >F5 {r.f5_count > 0 ? `(${r.f5_count})` : ''}</Button>
                            )}
                            {!r.is_historical && r.status !== 'completed' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="bg-purple-50 hover:bg-purple-100"
                                disabled={completingProjectId === r.project_id}
                                onClick={async (e)=>{ 
                                  e.stopPropagation();
                                  if (r.project_id) {
                                    await handleCompleteProject(r.project_id);
                                  }
                                }}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {completingProjectId === r.project_id ? 'Completing...' : 'Complete'}
                              </Button>
                            )}
                            {!r.is_historical && r.status === 'completed' && (
                              <div className="flex items-center gap-1 text-sm text-muted-foreground px-2">
                                <CheckCircle className="h-4 w-4" />
                                <span>Completed</span>
                              </div>
                            )}
                          </div>
                        </TableCell>
                    )}
                      </TableRow>
                    ))}
                  </>
                )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

      {/* Summary by Grant table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('management.table.title_by_grant')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('management.table.loading')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('management.table.grant')}</TableHead>
                  <TableHead className="text-right">{t('management.table.plan')}</TableHead>
                  <TableHead className="text-right">{t('management.table.actuals')}</TableHead>
                  <TableHead className="text-right">{t('management.table.variance')}</TableHead>
                  <TableHead className="text-right">{t('management.table.burn')}</TableHead>
                  <TableHead>{t('management.table.f4s')}</TableHead>
                  <TableHead className="text-right">{t('management.table.f4_complete')}</TableHead>
                  <TableHead>{t('management.table.f5s')}</TableHead>
                  <TableHead className="text-right">{t('management.table.f5_complete')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantSummaryRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">{t('management.table.no_data')}</TableCell>
                  </TableRow>
                ) : (
                  <>
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold">
                        {grantSummaryRows.reduce((s, r) => s + r.plan, 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {grantSummaryRows.reduce((s, r) => s + r.actual, 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {grantSummaryRows.reduce((s, r) => s + r.variance, 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {(() => {
                          const totalPlan = grantSummaryRows.reduce((s, r) => s + r.plan, 0)
                          const totalActual = grantSummaryRows.reduce((s, r) => s + r.actual, 0)
                          return totalPlan > 0 ? (totalActual / totalPlan * 100).toFixed(0) + '%' : '0%'
                        })()}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {grantSummaryRows.reduce((s, r) => s + r.f4_count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {(() => {
                          const total = grantSummaryRows.reduce((s, r) => s + r.total_projects, 0)
                          const withF4 = grantSummaryRows.reduce((s, r) => s + r.projects_with_f4, 0)
                          return total > 0 ? Math.round((withF4 / total) * 100) + '%' : '0%'
                        })()}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {grantSummaryRows.reduce((s, r) => s + r.f5_count, 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {(() => {
                          const total = grantSummaryRows.reduce((s, r) => s + r.total_projects, 0)
                          const withF5 = grantSummaryRows.reduce((s, r) => s + r.projects_with_f5, 0)
                          return total > 0 ? Math.round((withF5 / total) * 100) + '%' : '0%'
                        })()}
                      </TableCell>
                    </TableRow>
                    {grantSummaryRows.map((r, idx) => (
                      <TableRow key={`grant-${idx}-${r.grantLabel}`}>
                        <TableCell className="font-medium">{r.grantLabel}</TableCell>
                        <TableCell className="text-right">{Number(r.plan || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(r.actual || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(r.variance || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{r.burn ? (r.burn * 100).toFixed(0) + '%' : '0%'}</TableCell>
                        <TableCell>{r.f4_count || 0}</TableCell>
                        <TableCell className="text-right">
                          {r.total_projects > 0 ? Math.round((r.projects_with_f4 / r.total_projects) * 100) + '%' : '0%'}
                        </TableCell>
                        <TableCell>{r.f5_count || 0}</TableCell>
                        <TableCell className="text-right">
                          {r.total_projects > 0 ? Math.round((r.projects_with_f5 / r.total_projects) * 100) + '%' : '0%'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Project detail modal when at project level and a row is clicked via explicit action */}
      <ProjectDetailModal
        projectId={detailProjectId}
        open={detailOpen}
        onOpenChange={(v)=> setDetailOpen(v)}
      />

      {/* F4/F5 Modals */}
      <UploadF4Modal 
        open={uploadF4Open} 
        onOpenChange={(v)=>{ 
          setUploadF4Open(v); 
          if (!v) setSelectedProjectId(null);
        }} 
        onSaved={loadRollup}
        initialProjectId={selectedProjectId}
      />
      <UploadF5Modal 
        open={uploadF5Open} 
        onOpenChange={(v)=>{ 
          setUploadF5Open(v); 
          if (!v) setSelectedProjectId(null);
        }} 
        onSaved={loadRollup}
        initialProjectId={selectedProjectId}
      />
      <ViewF4Modal 
        summaryId={selectedF4Id} 
        open={viewF4Open} 
        onOpenChange={(v)=>{ 
          setViewF4Open(v); 
          if (!v) setSelectedF4Id(null);
        }} 
        onSaved={loadRollup}
      />
      <ViewF5Modal 
        reportId={selectedF5Id} 
        open={viewF5Open} 
        onOpenChange={(v)=>{ 
          setViewF5Open(v); 
          if (!v) setSelectedF5Id(null);
        }} 
        onSaved={loadRollup}
      />

      {/* F4 Reports List Modal */}
      <Dialog open={f4ListOpen} onOpenChange={setF4ListOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>F4 Reports</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {f4Reports.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No F4 reports found</p>
            ) : (
              f4Reports.map((f4: any) => (
                <div key={f4.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">Report Date: {f4.report_date ? new Date(f4.report_date).toLocaleDateString() : '-'}</div>
                    <div className="text-sm text-muted-foreground">
                      Total Expenses: {Number(f4.total_expenses || 0).toLocaleString()} USD
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setF4ListOpen(false);
                      setSelectedF4Id(f4.id);
                      setViewF4Open(true);
                    }}
                  >View/Edit</Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* F5 Reports List Modal */}
      <Dialog open={f5ListOpen} onOpenChange={setF5ListOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>F5 Reports</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {f5Reports.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No F5 reports found</p>
            ) : (
              f5Reports.map((f5: any) => (
                <div key={f5.id} className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <div className="font-medium">Report Date: {f5.report_date ? new Date(f5.report_date).toLocaleDateString() : '-'}</div>
                    <div className="text-sm text-muted-foreground">
                      Activities: {f5.activities_count || 0}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setF5ListOpen(false);
                      setSelectedF5Id(f5.id);
                      setViewF5Open(true);
                    }}
                  >View/Edit</Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 