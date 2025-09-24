'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface MOU {
  id: string
  mou_code: string
  partner_name: string
  err_name: string
  state: string | null
  total_amount: number
  end_date: string | null
  file_key: string | null
  created_at: string
}

interface MOUDetail {
  mou: MOU
  project?: {
    banking_details: string | null
    program_officer_name: string | null
    program_officer_phone: string | null
    reporting_officer_name: string | null
    reporting_officer_phone: string | null
    finance_officer_name: string | null
    finance_officer_phone: string | null
    project_objectives: string | null
    intended_beneficiaries: string | null
    planned_activities: string | null
    locality: string | null
    state: string | null
    "Sector (Primary)"?: string | null
    "Sector (Secondary)"?: string | null
  } | null
  partner?: {
    name: string
    contact_person: string | null
    email: string | null
    phone_number: string | null
    address: string | null
    position?: string | null
  } | null
}

export default function F3MOUsPage() {
  const { t } = useTranslation(['common'])
  const [mous, setMous] = useState<MOU[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeMou, setActiveMou] = useState<MOU | null>(null)
  const [detail, setDetail] = useState<MOUDetail | null>(null)

  const fetchMous = async () => {
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/f3/mous${qs}`)
      const data = await res.json()
      setMous(data)
    } catch (e) {
      console.error('Failed to load MOUs', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMous()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>F3 MOUs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Input placeholder="Search by code or partner" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Button variant="outline" onClick={fetchMous}>{t('common:search') || 'Search'}</Button>
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted-foreground">{t('common:loading') || 'Loading...'}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MOU Code</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>ERR / State</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mous.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.mou_code}</TableCell>
                    <TableCell>{m.partner_name}</TableCell>
                    <TableCell>{m.err_name}{m.state ? ` — ${m.state}` : ''}</TableCell>
                    <TableCell className="text-right">{Number(m.total_amount || 0).toLocaleString()}</TableCell>
                    <TableCell>{m.end_date ? new Date(m.end_date).toLocaleDateString() : '-'}</TableCell>
                    <TableCell>{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          setActiveMou(m)
                          setPreviewOpen(true)
                          try {
                            const res = await fetch(`/api/f3/mous/${m.id}`)
                            const data = await res.json()
                            setDetail(data)
                          } catch (e) {
                            console.error('Failed loading detail', e)
                          }
                        }}
                      >
                        Preview
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeMou?.mou_code || 'MOU'}</DialogTitle>
          </DialogHeader>
          {activeMou && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="text-lg font-semibold mb-2">Memorandum of Understanding Agreement</div>
                <div className="text-sm">
                  <div className="font-medium">Between</div>
                  <div>{activeMou.partner_name}</div>
                  <div className="font-medium mt-2">And</div>
                  <div>{activeMou.err_name}</div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">1. Purpose</div>
                <p className="text-sm">This MOU will guide the partnership between {activeMou.partner_name} and {activeMou.err_name} to support the community and provide for the humanitarian needs of people affected by the ongoing conflict in Sudan.</p>
                <p className="text-sm mt-2">This will be accomplished by undertaking the following activities:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{activeMou.err_name} shall</div>
                    <div className="text-sm space-y-2">
                      {detail?.project?.project_objectives && (
                        <div>
                          <div className="font-semibold">Objectives</div>
                          <div className="whitespace-pre-wrap">{detail.project.project_objectives}</div>
                        </div>
                      )}
                      {detail?.project?.intended_beneficiaries && (
                        <div>
                          <div className="font-semibold">Target Beneficiaries</div>
                          <div className="whitespace-pre-wrap">{detail.project.intended_beneficiaries}</div>
                        </div>
                      )}
                      {detail?.project?.planned_activities && (
                        <div>
                          <div className="font-semibold">Planned Activities</div>
                          <div className="whitespace-pre-wrap">{detail.project.planned_activities}</div>
                        </div>
                      )}
                      {(detail?.project?.locality || detail?.project?.state) && (
                        <div className="text-xs text-muted-foreground">Location: {detail?.project?.locality || '-'} / {detail?.project?.state || '-'}</div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="font-medium mb-2">{activeMou.partner_name} shall</div>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      <li>Provide a sum of ${Number(activeMou.total_amount || 0).toLocaleString()}.</li>
                      <li>Accept applications submitted by communities that determine needs priorities (protection, WASH, food security, health, shelter/NFIs).</li>
                      <li>Assess needs fairly using the community-led methodology (F1 submit).</li>
                      <li>Provide technical support and ensure consistent follow-up on agreed procedures.</li>
                      <li>Report to the donor.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">2. Principles of Partnership</div>
                <p className="text-sm">All parties have entered into this agreement in a spirit of cooperation, valuing the different skills, experiences, knowledge, and opinions that each party brings. All parties will support a culture where risk management is valued as essential and beneficial. The parties commit to desired outcomes and expected benefits, share and listen to new ideas, seek to use experiences to overcome challenges, and agree to regular and proactive communication with early escalation of issues.</p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">3. Reports</div>
                <p className="text-sm">The partner shall present a narrative report (F5) and a financial report (F4) after completion, sharing details of work completed, people supported, and a breakdown of costs. This must follow the F-system templates. ERR undertakes to return any funds for which accounting is not provided.</p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">4. Funding</div>
                <p className="text-sm">The {activeMou.partner_name} will provide a grant of ${Number(activeMou.total_amount || 0).toLocaleString()} upon signing this MOU. Disbursement and proof-of-payment requirements apply per policy.</p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">5. Budget</div>
                <p className="text-sm">A detailed budget is maintained in the F1(s) linked to this MOU. Procurement procedures apply; changes or obstacles must be reported at least 24 hours in advance.</p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">6. Approved Accounts</div>
                <div className="text-sm whitespace-pre-wrap">{detail?.project?.banking_details || 'Account details as shared and approved by ERR will be used for disbursement.'}</div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">7. Duration</div>
                <p className="text-sm">This MOU is effective upon signature by authorized officials of both parties. {activeMou.end_date ? `It will terminate on ${new Date(activeMou.end_date).toLocaleDateString()}.` : 'It remains valid unless terminated by mutual consent.'}</p>
              </div>

              <div className="rounded-lg border p-4">
                <div className="font-semibold mb-2">8. Contact Information</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium mb-1">Partner</div>
                    <div>{detail?.partner?.name || activeMou.partner_name}</div>
                    {detail?.partner?.contact_person && (
                      <div>Representative: {detail.partner.contact_person}</div>
                    )}
                    {detail?.partner?.position && (
                      <div>Position: {detail.partner.position}</div>
                    )}
                    {detail?.partner?.email && (
                      <div>Email: {detail.partner.email}</div>
                    )}
                    {detail?.partner?.phone_number && (
                      <div>Phone: {detail.partner.phone_number}</div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium mb-1">ERR</div>
                    <div>{activeMou.err_name}</div>
                    {detail?.project?.program_officer_name && (
                      <div>Representative: {detail.project.program_officer_name}</div>
                    )}
                    {detail?.project?.program_officer_phone && (
                      <div>Tel: {detail.project.program_officer_phone}</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>Close</Button>
                <Button
                  onClick={async () => {
                    if (!activeMou.file_key) return
                    const resp = await fetch(`/api/storage/signed-url?bucket=images&path=${encodeURIComponent(activeMou.file_key)}`)
                    const json = await resp.json()
                    if (json?.url) window.open(json.url, '_blank')
                  }}
                  disabled={!activeMou.file_key}
                >
                  Download
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


