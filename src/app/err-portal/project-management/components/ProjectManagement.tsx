'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RefreshCw, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
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

  const loadRollup = async () => {
    setLoading(true)
    const res = await fetch(`/api/overview/rollup`)
    const j = await res.json()
    setKpis(j.kpis || {})
    setRows(j.rows || [])
    setLoading(false)
  }

  const handleRefresh = async () => {
    await loadRollup()
  }

  useEffect(() => {
    loadRollup()
  }, [])

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

  const displayed = level === 'state' ? stateRows : (level === 'room' ? roomRows : projectRows)

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
    if (level === 'state') {
      setSelectedStateName(r.state)
      setLevel('room')
    } else if (level === 'room') {
      setSelectedErrId(r.err_id || '—')
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
          <div className="text-xs text-muted-foreground mb-2">
            {level === 'state' && (
              <span>
                {t('management.table.tips.state')} 
                <span className="ml-2 font-medium text-foreground">→ Click a row to view ERR rooms</span>
              </span>
            )}
            {level === 'room' && (
              <span>
                {t('management.table.tips.room')} 
                <span className="ml-2 font-medium text-foreground">→ Click a row to view projects</span>
              </span>
            )}
            {level === 'project' && t('management.table.tips.project')}
          </div>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('management.table.loading')}</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                  {level === 'state' ? (
                    <>
                      <TableHead>{t('management.table.state')}</TableHead>
                    </>
                  ) : level === 'room' ? (
                    <>
                      <TableHead>{t('management.table.err')}</TableHead>
                      <TableHead>{t('management.table.state')}</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>{t('management.table.err')}</TableHead>
                      <TableHead>{t('management.table.state')}</TableHead>
                      <TableHead>{t('management.table.mou')}</TableHead>
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
                  <TableHead>{t('management.table.last_f4')}</TableHead>
                  <TableHead>{t('management.table.last_f5')}</TableHead>
                  {level === 'project' && <TableHead>{t('management.table.actions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {(displayed||[]).length===0 ? (
                  <TableRow><TableCell colSpan={level==='project'?14:(level==='room'?12:11)} className="text-center text-muted-foreground">{t('management.table.no_data')}</TableCell></TableRow>
                ) : (
                  <>
                    {/* Total Row */}
                    <TableRow className="bg-muted/50 font-semibold">
                      {level === 'state' ? (
                        <>
                          <TableCell className="font-semibold">Total</TableCell>
                        </>
                      ) : level === 'room' ? (
                        <>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell></TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-semibold">Total</TableCell>
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                        </>
                      )}
                      <TableCell className="text-right font-semibold">{Number(totals.plan || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(totals.actual || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{Number(totals.variance || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">{totals.burn ? (totals.burn * 100).toFixed(0) + '%' : '0%'}</TableCell>
                      <TableCell className="font-semibold">{totals.f4_count || 0}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {level === 'project' 
                          ? (totals.f4_count > 0 ? '100%' : '0%')
                          : `${totals.total_projects > 0 ? Math.round((totals.projects_with_f4 / totals.total_projects) * 100) : 0}%`
                        }
                      </TableCell>
                      <TableCell className="font-semibold">{totals.f5_count || 0}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {level === 'project' 
                          ? (totals.f5_count > 0 ? '100%' : '0%')
                          : `${totals.total_projects > 0 ? Math.round((totals.projects_with_f5 / totals.total_projects) * 100) : 0}%`
                        }
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      {level === 'project' && <TableCell></TableCell>}
                    </TableRow>
                    {displayed.map((r:any, idx:number)=> (
                  <TableRow 
                    key={r.project_id || r.err_id || r.state || idx} 
                    className={cn(
                      "cursor-pointer transition-colors",
                      level !== 'project' && "hover:bg-muted/50"
                    )}
                    onClick={()=>onRowClick(r)}
                  >
                    {level === 'state' ? (
                      <>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{r.state || '-'}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                      </>
                    ) : level === 'room' ? (
                      <>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{r.err_id || '-'}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </TableCell>
                        <TableCell>{r.state || '-'}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{r.err_id || '-'}</TableCell>
                        <TableCell>{r.state || '-'}</TableCell>
                        <TableCell>{r.has_mou ? (r.mou_code || 'Yes') : '-'}</TableCell>
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
                    <TableCell>{r.last_report_date ? new Date(r.last_report_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{r.last_f5_date ? new Date(r.last_f5_date).toLocaleDateString() : '-'}</TableCell>
                    {level === 'project' && (
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
                                setSelectedProjectId(projectId);
                                // Load existing F4 reports for this project
                                if (projectId) {
                                  setLoadingReports(true);
                                  try {
                                    const res = await fetch('/api/f4/list');
                                    const data = await res.json();
                                    const projectF4s = (data || []).filter((f4: any) => f4.project_id === projectId);
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
                            >F4 {r.f4_count > 0 ? `(${r.f4_count})` : ''}</Button>
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