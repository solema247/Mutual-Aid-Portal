'use client'

import { useEffect, useState, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import UploadF4Modal from './components/UploadF4Modal'
import { useTranslation } from 'react-i18next'
import ViewF4Modal from './components/ViewF4Modal'
import UploadF5Modal from './components/UploadF5Modal'
import ViewF5Modal from './components/ViewF5Modal'
import { useSearchParams, useRouter } from 'next/navigation'

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

interface F5Row {
  id: string
  project_id: string | null
  err_name?: string | null
  state?: string | null
  grant_call?: string | null
  donor?: string | null
  report_date: string | null
  activities_count: number
  updated_at: string
}

function F4F5ReportingPageContent() {
  const { t } = useTranslation(['f4f5'])
  const searchParams = useSearchParams()
  const router = useRouter()
  const [tab, setTab] = useState<'f4'|'f5'>('f4')
  const [rows, setRows] = useState<F4Row[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [fErr, setFErr] = useState('')
  const [fState, setFState] = useState('')
  const [fDonor, setFDonor] = useState('')
  const [fGrant, setFGrant] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [viewId, setViewId] = useState<number | null>(null)
  const [viewOpen, setViewOpen] = useState(false)

  // F5 state
  const [f5Rows, setF5Rows] = useState<F5Row[]>([])
  const [f5Loading, setF5Loading] = useState(false)
  const [f5Q, setF5Q] = useState('')
  const [f5Err, setF5Err] = useState('')
  const [f5State, setF5State] = useState('')
  const [f5Donor, setF5Donor] = useState('')
  const [f5Grant, setF5Grant] = useState('')
  const [uploadF5Open, setUploadF5Open] = useState(false)
  const [viewF5Id, setViewF5Id] = useState<string | null>(null)
  const [viewF5Open, setViewF5Open] = useState(false)

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

  const loadF5 = async () => {
    try {
      setF5Loading(true)
      const res = await fetch('/api/f5/list')
      if (!res.ok) throw new Error('failed f5 list')
      const data = await res.json()
      setF5Rows(data)
    } catch (e) {
      console.error(e)
    } finally {
      setF5Loading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'f5') loadF5() }, [tab])

  // Handle restore from minimized across pages and when search params change
  useEffect(() => {
    const restore = searchParams.get('restore')
    const localRestore = (typeof window !== 'undefined') ? window.localStorage.getItem('err_restore') : null

    const target = restore || localRestore || null
    if (target === 'f4') {
      // Ensure F4 tab is active so modal component is mounted
      setTab('f4')
      setUploadOpen(true)
      if (restore) router.replace('/err-portal/f4-f5-reporting')
      try { window.localStorage.removeItem('err_restore') } catch {}
    } else if (target === 'f5') {
      // Ensure F5 tab is active so modal component is mounted
      setTab('f5')
      setUploadF5Open(true)
      if (restore) router.replace('/err-portal/f4-f5-reporting')
      try { window.localStorage.removeItem('err_restore') } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="f4">{t('tabs.f4')}</TabsTrigger>
          <TabsTrigger value="f5">{t('tabs.f5')}</TabsTrigger>
        </TabsList>

        <TabsContent value="f4" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{t('f4.title')}</div>
            <Button className="bg-green-700 hover:bg-green-800 text-white font-bold" onClick={() => { try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.localStorage.removeItem('err_restore'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; setUploadOpen(true) }}>{t('f4.upload')}</Button>
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-2 items-center">
            <Input className="h-9 flex-1 md:flex-none md:w-64" placeholder={t('f4.search') as string} value={q} onChange={(e)=>setQ(e.target.value)} />
            <Select value={fErr || '__ALL__'} onValueChange={(v)=>setFErr(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f4.filters.err') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                {[...new Set(rows.map(r=>r.err_name).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fState || '__ALL__'} onValueChange={(v)=>setFState(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f4.filters.state') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                {[...new Set(rows.map(r=>r.state).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fDonor || '__ALL__'} onValueChange={(v)=>setFDonor(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f4.filters.donor') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                {[...new Set(rows.map(r=>r.donor).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fGrant || '__ALL__'} onValueChange={(v)=>setFGrant(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f4.filters.grant') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f4.filters.all')}</SelectItem>
                {[...new Set(rows.map(r=>r.grant_call).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-9 w-full md:w-24 md:ml-auto"
              onClick={() => { setQ(''); setFErr(''); setFState(''); setFDonor(''); setFGrant(''); }}
            >{t('f4.filters.reset')}</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('f4.headers.err')}</TableHead>
                    <TableHead>{t('f4.headers.state')}</TableHead>
                    <TableHead>{t('f4.headers.grant')}</TableHead>
                    <TableHead>{t('f4.headers.donor')}</TableHead>
                    <TableHead>{t('f4.headers.report_date')}</TableHead>
                    <TableHead className="text-right">{t('f4.headers.total_grant')}</TableHead>
                    <TableHead className="text-right">{t('f4.headers.total_expenses')}</TableHead>
                    <TableHead className="text-right">{t('f4.headers.remainder')}</TableHead>
                    <TableHead>{t('f4.headers.files')}</TableHead>
                    <TableHead>{t('f4.headers.updated')}</TableHead>
                    <TableHead>{t('f4.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6">{t('f4.loading')}</TableCell></TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">{t('f4.empty')}</TableCell></TableRow>
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
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={()=>{ setViewId(r.id); setViewOpen(true) }}>{t('f4.view')}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <UploadF4Modal open={uploadOpen} onOpenChange={setUploadOpen} onSaved={load} />
          <ViewF4Modal summaryId={viewId} open={viewOpen} onOpenChange={(v)=>{ setViewOpen(v); if (!v) setViewId(null) }} />
        </TabsContent>

        <TabsContent value="f5" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{t('f5.title')}</div>
            <Button className="bg-green-700 hover:bg-green-800 text-white font-bold" onClick={() => { try { window.localStorage.removeItem('err_minimized_modal'); window.localStorage.removeItem('err_minimized_payload'); window.localStorage.removeItem('err_restore'); window.dispatchEvent(new CustomEvent('err_minimized_modal_change')) } catch {}; setUploadF5Open(true) }}>{t('f5.upload')}</Button>
          </div>

          <div className="flex flex-wrap md:flex-nowrap gap-2 items-center">
            <Input className="h-9 flex-1 md:flex-none md:w-64" placeholder={t('f5.search') as string} value={f5Q} onChange={(e)=>setF5Q(e.target.value)} />
            <Select value={f5Err || '__ALL__'} onValueChange={(v)=>setF5Err(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f5.filters.err') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                {[...new Set(f5Rows.map(r=>r.err_name).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={f5State || '__ALL__'} onValueChange={(v)=>setF5State(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f5.filters.state') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                {[...new Set(f5Rows.map(r=>r.state).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={f5Donor || '__ALL__'} onValueChange={(v)=>setF5Donor(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f5.filters.donor') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                {[...new Set(f5Rows.map(r=>r.donor).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={f5Grant || '__ALL__'} onValueChange={(v)=>setF5Grant(v==='__ALL__'?'':v)}>
              <SelectTrigger className="h-9 w-full md:w-48"><SelectValue placeholder={t('f5.filters.grant') as string} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__ALL__">{t('f5.filters.all')}</SelectItem>
                {[...new Set(f5Rows.map(r=>r.grant_call).filter(Boolean))].map((v)=> (
                  <SelectItem key={String(v)} value={String(v)}>{String(v)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              className="h-9 w-full md:w-24 md:ml-auto"
              onClick={() => { setF5Q(''); setF5Err(''); setF5State(''); setF5Donor(''); setF5Grant(''); }}
            >{t('f5.filters.reset')}</Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('f5.headers.err')}</TableHead>
                    <TableHead>{t('f5.headers.state')}</TableHead>
                    <TableHead>{t('f5.headers.grant')}</TableHead>
                    <TableHead>{t('f5.headers.donor')}</TableHead>
                    <TableHead>{t('f5.headers.report_date')}</TableHead>
                    <TableHead className="text-right">{t('f5.headers.activities')}</TableHead>
                    <TableHead>{t('f5.headers.updated')}</TableHead>
                    <TableHead>{t('f5.headers.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {f5Loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6">{t('f5.loading')}</TableCell></TableRow>
                  ) : f5Rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">{t('f5.empty')}</TableCell></TableRow>
                  ) : f5Rows
                    .filter(r => !f5Q || [r.err_name, r.state, r.donor, r.grant_call].some(v => (v||'').toLowerCase().includes(f5Q.toLowerCase())))
                    .filter(r => !f5Err || r.err_name === f5Err)
                    .filter(r => !f5State || r.state === f5State)
                    .filter(r => !f5Donor || r.donor === f5Donor)
                    .filter(r => !f5Grant || r.grant_call === f5Grant)
                    .map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.err_name || '-'}</TableCell>
                      <TableCell>{r.state || '-'}</TableCell>
                      <TableCell>{r.grant_call || '-'}</TableCell>
                      <TableCell>{r.donor || '-'}</TableCell>
                      <TableCell>{r.report_date ? new Date(r.report_date).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-right">{Number(r.activities_count || 0).toLocaleString()}</TableCell>
                      <TableCell>{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={()=>{ setViewF5Id(r.id); setViewF5Open(true) }}>{t('f5.view')}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <UploadF5Modal open={uploadF5Open} onOpenChange={setUploadF5Open} onSaved={loadF5} />
          <ViewF5Modal reportId={viewF5Id} open={viewF5Open} onOpenChange={(v)=>{ setViewF5Open(v); if (!v) setViewF5Id(null) }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function F4F5ReportingPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6">Loading...</div>}>
      <F4F5ReportingPageContent />
    </Suspense>
  )
}


