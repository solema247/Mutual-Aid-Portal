'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import UploadF4Modal from './components/UploadF4Modal'

interface F4Row {
  id: number
  project_id: string | null
  err_id: string | null
  err_name?: string | null
  state?: string | null
  grant_call?: string | null
  donor?: string | null
  report_date: string | null
  total_grant: number | null
  total_expenses: number | null
  remainder: number | null
  attachments_count: number
  updated_at: string
}

export default function F4F5ReportingPage() {
  const [tab, setTab] = useState<'f4'|'f5'>('f4')
  const [rows, setRows] = useState<F4Row[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [fErr, setFErr] = useState('')
  const [fState, setFState] = useState('')
  const [fDonor, setFDonor] = useState('')
  const [fGrant, setFGrant] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/f4/list')
      if (!res.ok) throw new Error('failed list')
      const data = await res.json()
      setRows(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="f4">F4 Financial</TabsTrigger>
          <TabsTrigger value="f5">F5 Program</TabsTrigger>
        </TabsList>

        <TabsContent value="f4" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">F4 Financial Reports</div>
            <Button className="bg-green-700 hover:bg-green-800 text-white font-bold" onClick={() => setUploadOpen(true)}>Upload F4</Button>
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-2 items-center">
            <Input className="h-9 flex-1 md:flex-none md:w-64" placeholder="Search…" value={q} onChange={(e)=>setQ(e.target.value)} />
            <Select value={fErr || '__ALL__'} onValueChange={(v)=>setFErr(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder="ERR" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All</SelectItem>
                {[...new Set(rows.map(r=>r.err_name).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fState || '__ALL__'} onValueChange={(v)=>setFState(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All</SelectItem>
                {[...new Set(rows.map(r=>r.state).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fDonor || '__ALL__'} onValueChange={(v)=>setFDonor(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder="Donor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All</SelectItem>
                {[...new Set(rows.map(r=>r.donor).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fGrant || '__ALL__'} onValueChange={(v)=>setFGrant(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder="Grant Call" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">All</SelectItem>
                {[...new Set(rows.map(r=>r.grant_call).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-9 w-full md:w-24 md:ml-auto"
              onClick={() => { setQ(''); setFErr(''); setFState(''); setFDonor(''); setFGrant(''); }}
            >Reset</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ERR</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Grant Call</TableHead>
                    <TableHead>Donor</TableHead>
                    <TableHead>Report Date</TableHead>
                    <TableHead className="text-right">Total Grant</TableHead>
                    <TableHead className="text-right">Total Expenses</TableHead>
                    <TableHead className="text-right">Remainder</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6">Loading…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No F4 reports yet</TableCell></TableRow>
                  ) : rows
                    .filter(r => !q || [r.err_name, r.state, r.donor, r.grant_call].some(v => (v||'').toLowerCase().includes(q.toLowerCase())))
                    .filter(r => !fErr || r.err_name === fErr)
                    .filter(r => !fState || r.state === fState)
                    .filter(r => !fDonor || r.donor === fDonor)
                    .filter(r => !fGrant || r.grant_call === fGrant)
                    .map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.err_name || r.err_id || '-'}</TableCell>
                      <TableCell>{r.state || '-'}</TableCell>
                      <TableCell>{r.grant_call || '-'}</TableCell>
                      <TableCell>{r.donor || '-'}</TableCell>
                      <TableCell>{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-right">{Number(r.total_grant || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(r.total_expenses || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(r.remainder || 0).toLocaleString()}</TableCell>
                      <TableCell>{r.attachments_count}</TableCell>
                      <TableCell>{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <UploadF4Modal open={uploadOpen} onOpenChange={setUploadOpen} onSaved={load} />
        </TabsContent>

        <TabsContent value="f5" className="mt-4">
          <Card><CardContent className="py-8 text-center text-muted-foreground">F5 (Program) coming next.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}


