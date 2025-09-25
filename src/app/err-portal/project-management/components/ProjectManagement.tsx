'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import ProjectDetailModal from './ProjectDetailModal'

type Donor = { id: string; name: string; short_name?: string }
type Grant = { id: string; name: string; shortname?: string; donor_id: string }
type Room = { id: string; name?: string; name_ar?: string; err_code?: string }

export default function ProjectManagement() {
  const [donors, setDonors] = useState<Donor[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [states, setStates] = useState<string[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  const [donor, setDonor] = useState('')
  const [grant, setGrant] = useState('')
  const [state, setState] = useState('')
  const [err, setErr] = useState('')

  const [loading, setLoading] = useState(false)
  const [kpis, setKpis] = useState<any>({})
  const [rows, setRows] = useState<any[]>([])

  // Drill-down state
  const [level, setLevel] = useState<'state'|'room'|'project'>('state')
  const [selectedStateName, setSelectedStateName] = useState<string>('')
  const [selectedErrId, setSelectedErrId] = useState<string>('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null)

  const loadOptions = async () => {
    const qs = new URLSearchParams()
    if (donor) qs.set('donor', donor)
    if (grant) qs.set('grant', grant)
    if (state) qs.set('state', state)
    const res = await fetch(`/api/overview/options?${qs.toString()}`)
    const j = await res.json()
    setDonors(j.donors || [])
    setGrants(j.grants || [])
    setStates(j.states || [])
    setRooms(j.rooms || [])
  }

  const loadRollup = async () => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (donor) qs.set('donor', donor)
    if (grant) qs.set('grant', grant)
    if (state) qs.set('state', state)
    if (err) qs.set('err', err)
    const res = await fetch(`/api/overview/rollup?${qs.toString()}`)
    const j = await res.json()
    setKpis(j.kpis || {})
    setRows(j.rows || [])
    setLoading(false)
  }

  useEffect(() => {
    loadOptions()
  }, [donor, grant, state])

  useEffect(() => {
    loadRollup()
  }, [donor, grant, state, err])

  const donorName = useMemo(() => donors.find(d => d.id === donor)?.name || 'All Donors', [donor, donors])

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
    // compute burn
    return Array.from(byState.values()).map(v => ({ ...v, burn: v.plan > 0 ? v.actual / v.plan : 0 }))
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
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={donor || '__ALL__'} onValueChange={(v)=>setDonor(v==='__ALL__'?'':v)}>
          <SelectTrigger className="h-9 w-full md:w-56"><SelectValue placeholder="Donor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">All Donors</SelectItem>
            {donors.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.short_name || d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={grant || '__ALL__'} onValueChange={(v)=>setGrant(v==='__ALL__'?'':v)}>
          <SelectTrigger className="h-9 w-full md:w-56"><SelectValue placeholder="Grant Call" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">All Grants</SelectItem>
            {grants.map(g => (
              <SelectItem key={g.id} value={g.id}>{g.shortname || g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state || '__ALL__'} onValueChange={(v)=>setState(v==='__ALL__'?'':v)}>
          <SelectTrigger className="h-9 w-full md:w-56"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">All States</SelectItem>
            {states.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={err || '__ALL__'} onValueChange={(v)=>setErr(v==='__ALL__'?'':v)}>
          <SelectTrigger className="h-9 w-full md:w-56"><SelectValue placeholder="ERR" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__ALL__">All ERR</SelectItem>
            {rooms.map(r => (
              <SelectItem key={r.id} value={r.id}>{r.name || r.err_code || r.name_ar}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-9 w-full md:w-24 md:ml-auto" onClick={()=>{ setDonor(''); setGrant(''); setState(''); setErr(''); }}>Reset</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle>Plan</CardTitle></CardHeader>
          <CardContent>
            ${Number(kpis.plan||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Sum of planned budgets from F1 planned activities.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Actuals</CardTitle></CardHeader>
          <CardContent>
            ${Number(kpis.actual||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Sum of recorded expenses from F4 reports.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Variance</CardTitle></CardHeader>
          <CardContent>
            ${Number(kpis.variance||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Plan minus Actuals for the current view.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Burn</CardTitle></CardHeader>
          <CardContent>
            {kpis.burn ? (kpis.burn*100).toFixed(0)+'%' : '0%'}
            <div className="text-xs text-muted-foreground mt-1">Actuals divided by Plan (utilization).</div>
          </CardContent>
        </Card>
      </div>

      {/* Project Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle>Projects</CardTitle></CardHeader>
          <CardContent>
            {Number(counters.total||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Committed projects (approved/active) in the current view.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>With MOUs</CardTitle></CardHeader>
          <CardContent>
            {Number(counters.withMou||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Projects linked to an F3 MOU.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>With F4s</CardTitle></CardHeader>
          <CardContent>
            {Number(counters.withF4||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Projects that have at least one F4 report.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>% F4 Complete</CardTitle></CardHeader>
          <CardContent>
            {(counters.pctF4*100).toFixed(0)}%
            <div className="text-xs text-muted-foreground mt-1">Share of projects with at least one F4.</div>
          </CardContent>
        </Card>
      </div>

      {/* F5 Program Reporting Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader><CardTitle>With F5s</CardTitle></CardHeader>
          <CardContent>
            {Number(counters.withF5||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Projects that have at least one F5 program report.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>% F5 Complete</CardTitle></CardHeader>
          <CardContent>
            {(counters.pctF5*100).toFixed(0)}%
            <div className="text-xs text-muted-foreground mt-1">Share of projects with at least one F5.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Individuals</CardTitle></CardHeader>
          <CardContent>
            {Number(kpis.f5_total_individuals||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Total individuals reached through F5 program reports.</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Families</CardTitle></CardHeader>
          <CardContent>
            {Number(kpis.f5_total_families||0).toLocaleString()}
            <div className="text-xs text-muted-foreground mt-1">Total families reached through F5 program reports.</div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle>
            All Active Projects
            {level !== 'state' && (
              <Button variant="outline" size="sm" className="ml-2" onClick={goBack}>Back</Button>
            )}
            {level === 'room' && selectedStateName ? (
              <span className="ml-2 text-sm text-muted-foreground">State: {selectedStateName}</span>
            ) : null}
            {level === 'project' && selectedErrId ? (
              <span className="ml-2 text-sm text-muted-foreground">State: {selectedStateName} · ERR: {selectedErrId}</span>
            ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
          <div className="text-xs text-muted-foreground mb-2">
            {level === 'state' && 'Tip: Click a state to drill into its ERR rooms.'}
            {level === 'room' && 'Tip: Click an ERR to drill into its projects.'}
            {level === 'project' && 'Tip: Click a project row or the View button to open details.'}
          </div>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                  {level === 'state' ? (
                    <>
                      <TableHead>State</TableHead>
                    </>
                  ) : level === 'room' ? (
                    <>
                      <TableHead>ERR</TableHead>
                      <TableHead>State</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>ERR</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>MOU</TableHead>
                    </>
                  )}
                  <TableHead className="text-right">Plan</TableHead>
                  <TableHead className="text-right">Actuals</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Burn</TableHead>
                  <TableHead>F4s</TableHead>
                  <TableHead>% F4 Complete</TableHead>
                  <TableHead>F5s</TableHead>
                  <TableHead>% F5 Complete</TableHead>
                  <TableHead>Last F4</TableHead>
                  <TableHead>Last F5</TableHead>
                  {level === 'project' && <TableHead>Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {(displayed||[]).length===0 ? (
                  <TableRow><TableCell colSpan={level==='project'?14:(level==='room'?12:11)} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : displayed.map((r:any, idx:number)=> (
                  <TableRow key={r.project_id || r.err_id || r.state || idx} className="cursor-pointer" onClick={()=>onRowClick(r)}>
                    {level === 'state' ? (
                      <>
                        <TableCell>{r.state || '-'}</TableCell>
                      </>
                    ) : level === 'room' ? (
                      <>
                        <TableCell>{r.err_id || '-'}</TableCell>
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
                          <Button
                            variant="outline"
                          size="sm"
                          onClick={(e)=>{ e.stopPropagation(); setDetailProjectId(r.project_id || null); setDetailOpen(true) }}
                        >View</Button>
                        </TableCell>
                    )}
                      </TableRow>
                    ))}
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
    </div>
  )
} 