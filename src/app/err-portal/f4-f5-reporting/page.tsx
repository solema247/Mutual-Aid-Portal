'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import UploadF4Modal from './components/UploadF4Modal'

interface F4Row {
  id: number
  project_id: string | null
  err_id: string | null
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
            <Button onClick={() => setUploadOpen(true)}>Upload F4</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ERR ID</TableHead>
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
                  ) : rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.err_id || '-'}</TableCell>
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


