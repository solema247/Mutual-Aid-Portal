'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

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
        <Card><CardHeader><CardTitle>Plan</CardTitle></CardHeader><CardContent>{Number(kpis.plan||0).toLocaleString()}</CardContent></Card>
        <Card><CardHeader><CardTitle>Actuals</CardTitle></CardHeader><CardContent>{Number(kpis.actual||0).toLocaleString()}</CardContent></Card>
        <Card><CardHeader><CardTitle>Variance</CardTitle></CardHeader><CardContent>{Number(kpis.variance||0).toLocaleString()}</CardContent></Card>
        <Card><CardHeader><CardTitle>Burn</CardTitle></CardHeader><CardContent>{kpis.burn ? (kpis.burn*100).toFixed(0)+'%' : '0%'}</CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>{donorName}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ERR</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>MOU</TableHead>
                  <TableHead className="text-right">Plan</TableHead>
                  <TableHead className="text-right">Actuals</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Burn</TableHead>
                  <TableHead>F4s</TableHead>
                  <TableHead>Last F4</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows||[]).length===0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No data</TableCell></TableRow>
                ) : rows.map((r:any)=> (
                  <TableRow key={r.project_id}>
                    <TableCell>{r.err_id || '-'}</TableCell>
                    <TableCell>{r.state || '-'}</TableCell>
                    <TableCell>{r.has_mou ? (r.mou_code || 'Yes') : '-'}</TableCell>
                    <TableCell className="text-right">{Number(r.plan||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(r.actual||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{Number(r.variance||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">{r.burn ? (r.burn*100).toFixed(0)+'%' : '0%'}</TableCell>
                    <TableCell>{r.f4_count||0}</TableCell>
                    <TableCell>{r.last_report_date ? new Date(r.last_report_date).toLocaleDateString() : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}