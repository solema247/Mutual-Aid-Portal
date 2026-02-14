'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { useTranslation } from 'react-i18next'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { FileText } from 'lucide-react'

interface ViewF4ModalProps {
  summaryId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export default function ViewF4Modal({ summaryId, open, onOpenChange, onSaved }: ViewF4ModalProps) {
  const { t } = useTranslation(['f4f5'])
  const { can } = useAllowedFunctions()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<any | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [summaryDraft, setSummaryDraft] = useState<any | null>(null)
  const [expensesDraft, setExpensesDraft] = useState<any[]>([])
  const [projectMeta, setProjectMeta] = useState<any | null>(null)
  const [fxRate, setFxRate] = useState<number | null>(null)

  useEffect(() => {
    if (!open || !summaryId) { 
      setData(null)
      setIsEditing(false)
      setSummaryDraft(null)
      setExpensesDraft([])
      setProjectMeta(null)
      setFxRate(null)
      return 
    }
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/f4/summary/${summaryId}`)
        const j = await res.json()
        if (!res.ok) throw new Error(j.error || 'Failed to load summary')
        setData(j)
        
        // Initialize draft data
        const summary = j.summary
        setSummaryDraft({
          report_date: summary?.report_date || '',
          beneficiaries: summary?.beneficiaries || '',
          lessons: summary?.lessons || '',
          training: summary?.training || '',
          excess_expenses: summary?.excess_expenses || '',
          surplus_use: summary?.surplus_use || '',
          total_other_sources: summary?.total_other_sources || 0
        })
        
        // Initialize expenses draft
        setExpensesDraft((j.expenses || []).map((e: any) => ({
          expense_id: e.expense_id,
          expense_activity: e.expense_activity || '',
          expense_description: e.expense_description || '',
          expense_amount_sdg: e.expense_amount_sdg ?? null,
          expense_amount: e.expense_amount ?? null,
          payment_date: e.payment_date || '',
          payment_method: e.payment_method || 'Bank Transfer',
          receipt_no: e.receipt_no || '',
          seller: e.seller || ''
        })))
        
        // Load project meta to get total grant
        if (summary?.project_id) {
          const { data: projectData, error } = await supabase
            .from('err_projects')
            .select(`
              id,
              expenses,
              planned_activities,
              emergency_rooms (err_code, name, name_ar)
            `)
            .eq('id', summary.project_id)
            .single()
          
          if (!error && projectData) {
            // Calculate total from planned_activities (for ERR App submissions)
            const plannedArr = Array.isArray(projectData.planned_activities)
              ? projectData.planned_activities
              : (typeof projectData.planned_activities === 'string' ? JSON.parse(projectData.planned_activities || '[]') : [])
            const fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
              const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
              return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
            }, 0)

            // Calculate total from expenses (for mutual_aid_portal submissions)
            const expensesArr = Array.isArray(projectData.expenses)
              ? projectData.expenses
              : (typeof projectData.expenses === 'string' ? JSON.parse(projectData.expenses || '[]') : [])
            const fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => {
              return s + (Number(ex.total_cost) || 0)
            }, 0)

            // Use expenses total if it exists (mutual_aid_portal), otherwise use planned_activities total (ERR App)
            const grantSum = fromExpenses > 0 ? fromExpenses : fromPlanned
            const room = projectData.emergency_rooms
            setProjectMeta({
              total_grant_from_project: grantSum
            })
          }
        }
      } catch (e) {
        console.error(e)
        setData(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [open, summaryId])

  const summary = data?.summary
  const project = summary?.err_projects
  const room = project?.emergency_rooms
  const attachments = data?.attachments || []

  const handleSave = async () => {
    if (!summaryId || !summaryDraft) return
    setSaving(true)
    try {
      const totalExpensesSDG = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0)
      const totalExpensesUSD = expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)
      const totalGrantUSD = projectMeta?.total_grant_from_project ?? summary?.total_grant ?? 0
      const remainderUSD = totalGrantUSD - totalExpensesUSD
      
      const summaryToSave = {
        ...summaryDraft,
        total_grant: totalGrantUSD,
        total_expenses: totalExpensesUSD,
        total_expenses_sdg: totalExpensesSDG,
        remainder: remainderUSD
      }
      
      const res = await fetch('/api/f4/update', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          summary_id: summaryId, 
          summary: summaryToSave, 
          expenses: expensesDraft 
        }) 
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Update failed')
      
      setIsEditing(false)
      if (onSaved) onSaved()
      // Reload data
      const reloadRes = await fetch(`/api/f4/summary/${summaryId}`)
      const reloadJson = await reloadRes.json()
      if (reloadRes.ok) {
        setData(reloadJson)
        setSummaryDraft({
          report_date: reloadJson.summary?.report_date || '',
          beneficiaries: reloadJson.summary?.beneficiaries || '',
          lessons: reloadJson.summary?.lessons || '',
          training: reloadJson.summary?.training || '',
          excess_expenses: reloadJson.summary?.excess_expenses || '',
          surplus_use: reloadJson.summary?.surplus_use || '',
          total_other_sources: reloadJson.summary?.total_other_sources || 0
        })
        setExpensesDraft((reloadJson.expenses || []).map((e: any) => ({
          expense_id: e.expense_id,
          expense_activity: e.expense_activity || '',
          expense_description: e.expense_description || '',
          expense_amount_sdg: e.expense_amount_sdg ?? null,
          expense_amount: e.expense_amount ?? null,
          payment_date: e.payment_date || '',
          payment_method: e.payment_method || 'Bank Transfer',
          receipt_no: e.receipt_no || '',
          seller: e.seller || ''
        })))
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update F4')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>F4 Report Details</DialogTitle>
            {!isEditing ? (
              <Button onClick={() => setIsEditing(true)} disabled={!can('f4_save')} title={!can('f4_save') ? t('no_permission') : undefined}>Edit</Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !can('f4_save')} title={!can('f4_save') ? t('no_permission') : undefined}>{saving ? 'Saving...' : 'Save'}</Button>
              </div>
            )}
          </div>
        </DialogHeader>
        {loading ? (
          <div className="py-10 text-center text-muted-foreground">Loading…</div>
        ) : !summary ? (
          <div className="py-10 text-center text-muted-foreground">No data</div>
        ) : (
          <div className="space-y-6">
            {/* Project / F1 context */}
            <div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ERR</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{room?.name || room?.name_ar || room?.err_code || project?.err_id || '-'}</div>
                </div>
                <div>
                  <Label>State</Label>
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{project?.state || '-'}</div>
                </div>
              </div>
              <div className="mt-3">
                <Label>Project Objectives</Label>
                <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{project?.project_objectives || '-'}</div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Report Date</Label>
                {isEditing ? (
                  <Input type="date" value={summaryDraft?.report_date ? (typeof summaryDraft.report_date === 'string' ? summaryDraft.report_date.split('T')[0] : new Date(summaryDraft.report_date).toISOString().split('T')[0]) : ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), report_date: e.target.value }))} />
                ) : (
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{summary?.report_date ? new Date(summary.report_date).toLocaleDateString() : '-'}</div>
                )}
              </div>
              <div>
                <Label>Beneficiaries</Label>
                {isEditing ? (
                  <Input value={summaryDraft?.beneficiaries || ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), beneficiaries: e.target.value }))} />
                ) : (
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{summary?.beneficiaries || '-'}</div>
                )}
              </div>
            </div>

            {/* FX Rate */}
            {isEditing && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('f4.preview.labels.fx_rate')}</Label>
                  <Input type="number" value={fxRate ?? ''} onChange={(e)=>{
                    const v = parseFloat(e.target.value)
                    setFxRate(isNaN(v) ? null : v)
                    // When exchange rate is set, calculate USD from SDG for all expenses
                    if (!isNaN(v) && v > 0) {
                      setExpensesDraft(prev => prev.map((ex:any)=>{
                        const sdg = ex.expense_amount_sdg
                        if (typeof sdg === 'number' && sdg > 0) {
                          return {
                            ...ex,
                            expense_amount: +(sdg / v).toFixed(2)
                          }
                        }
                        return ex
                      }))
                    }
                  }} placeholder={t('f4.preview.labels.fx_placeholder') as string} />
                </div>
              </div>
            )}

            {/* Financials */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('f4.preview.financials.total_grant')} (USD)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{(projectMeta?.total_grant_from_project ?? summary?.total_grant ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_expenses')} (USD)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_expenses')} (SDG)</Label>
                <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount_sdg) || 0), 0).toLocaleString()}</div>
              </div>
              <div>
                <Label>{t('f4.preview.financials.remainder')} (USD)</Label>
                <Input type="number" value={(projectMeta?.total_grant_from_project ?? summary?.total_grant ?? 0) - expensesDraft.reduce((s, ex) => s + (Number(ex.expense_amount) || 0), 0)} readOnly />
              </div>
              <div>
                <Label>{t('f4.preview.financials.total_other_sources')}</Label>
                {isEditing ? (
                  <Input type="number" value={summaryDraft?.total_other_sources ?? ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), total_other_sources: parseFloat(e.target.value)||0 }))} />
                ) : (
                  <div className="h-10 flex items-center px-3 rounded border bg-muted/50">{Number(summary?.total_other_sources || 0).toLocaleString()}</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Excess Expenses (How covered?)</Label>
                {isEditing ? (
                  <Input value={summaryDraft?.excess_expenses || ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), excess_expenses: e.target.value }))} />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.excess_expenses || '-'}</div>
                )}
              </div>
              <div>
                <Label>Surplus Use</Label>
                {isEditing ? (
                  <Input value={summaryDraft?.surplus_use || ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), surplus_use: e.target.value }))} />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.surplus_use || '-'}</div>
                )}
              </div>
              <div>
                <Label>Lessons Learned</Label>
                {isEditing ? (
                  <Input value={summaryDraft?.lessons || ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), lessons: e.target.value }))} />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.lessons || '-'}</div>
                )}
              </div>
              <div>
                <Label>Training Needs</Label>
                {isEditing ? (
                  <Input value={summaryDraft?.training || ''} onChange={(e)=>setSummaryDraft((s:any)=>({ ...(s||{}), training: e.target.value }))} />
                ) : (
                  <div className="min-h-[40px] px-3 py-2 rounded border bg-muted/50 text-sm whitespace-pre-wrap">{summary?.training || '-'}</div>
                )}
              </div>
            </div>

            {/* Expenses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Expenses</Label>
                {isEditing && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setExpensesDraft(prev => ([...prev, {
                      expense_activity: '',
                      expense_description: '',
                      expense_amount_sdg: null,
                      expense_amount: null,
                      payment_date: '',
                      payment_method: 'Bank Transfer',
                      receipt_no: '',
                      seller: ''
                    }]))}
                  >Add Expense</Button>
                )}
              </div>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[14%] py-1 px-2 text-xs">Activity</TableHead>
                      <TableHead className="w-[20%] py-1 px-2 text-xs">Description</TableHead>
                      <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (SDG)</TableHead>
                      <TableHead className="w-[10%] py-1 px-2 text-right text-xs">Amount (USD)</TableHead>
                      <TableHead className="w-[12%] py-1 px-2 text-xs">Payment Date</TableHead>
                      <TableHead className="w-[10%] py-1 px-2 text-xs">Method</TableHead>
                      <TableHead className="w-[10%] py-1 px-2 text-xs">Receipt</TableHead>
                      <TableHead className="w-[14%] py-1 px-2 text-xs">Seller</TableHead>
                      {isEditing && <TableHead className="w-[8%] py-1 px-2 text-xs text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensesDraft.length === 0 ? (
                      <TableRow><TableCell colSpan={isEditing ? 9 : 8} className="text-muted-foreground text-center">No expenses</TableCell></TableRow>
                    ) : expensesDraft.map((ex, idx) => (
                      <TableRow key={ex.expense_id || idx}>
                        <TableCell className="py-1 px-2">
                          {isEditing ? (
                            <Input className="h-8" value={ex.expense_activity || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_activity: e.target.value}; setExpensesDraft(arr)
                            }} />
                          ) : (
                            ex.expense_activity || '-'
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {isEditing ? (
                            <Input className="h-8" value={ex.expense_description || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], expense_description: e.target.value}; setExpensesDraft(arr)
                            }} />
                          ) : (
                            ex.expense_description || '-'
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-right">
                          {isEditing ? (
                            <Input className="h-8" type="number" placeholder="SDG" value={ex.expense_amount_sdg ?? ''} onChange={(e)=>{
                              const enteredValue = parseFloat(e.target.value) || 0
                              const arr = [...expensesDraft]
                              arr[idx] = {
                                ...arr[idx],
                                expense_amount_sdg: enteredValue || null,
                                // Auto-calculate USD if exchange rate is set
                                expense_amount: (fxRate && fxRate > 0 && enteredValue > 0) ? +(enteredValue / fxRate).toFixed(2) : arr[idx].expense_amount
                              }
                              setExpensesDraft(arr)
                            }} />
                          ) : (
                            Number(ex.expense_amount_sdg || 0).toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-right">
                          {isEditing ? (
                            <Input className="h-8" type="number" placeholder="USD" value={ex.expense_amount ?? ''} onChange={(e)=>{
                              const enteredValue = parseFloat(e.target.value) || 0
                              const arr = [...expensesDraft]
                              arr[idx] = {
                                ...arr[idx],
                                expense_amount: enteredValue || null,
                                // Auto-calculate SDG if exchange rate is set
                                expense_amount_sdg: (fxRate && fxRate > 0 && enteredValue > 0) ? +(enteredValue * fxRate).toFixed(2) : arr[idx].expense_amount_sdg
                              }
                              setExpensesDraft(arr)
                            }} />
                          ) : (
                            Number(ex.expense_amount || 0).toLocaleString()
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {isEditing ? (
                            <Input className="h-8" type="date" value={ex.payment_date || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_date: e.target.value}; setExpensesDraft(arr)
                            }} />
                          ) : (
                            ex.payment_date ? new Date(ex.payment_date).toLocaleDateString() : '-'
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {isEditing ? (
                            <Select value={ex.payment_method || 'Bank Transfer'} onValueChange={(v)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], payment_method: v}; setExpensesDraft(arr)
                            }}>
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                                <SelectItem value="Cash">Cash</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            ex.payment_method || '-'
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {isEditing ? (
                            <Input className="h-8" value={ex.receipt_no || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], receipt_no: e.target.value}; setExpensesDraft(arr)
                            }} />
                          ) : (
                            ex.receipt_no || '-'
                          )}
                        </TableCell>
                        <TableCell className="py-1 px-2">
                          {isEditing ? (
                            <Input className="h-8" value={ex.seller || ''} onChange={(e)=>{
                              const arr=[...expensesDraft]; arr[idx]={...arr[idx], seller: e.target.value}; setExpensesDraft(arr)
                            }} />
                          ) : (
                            ex.seller || '-'
                          )}
                        </TableCell>
                        {isEditing && (
                          <TableCell className="py-1 px-2 text-right">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                const arr = [...expensesDraft]
                                arr.splice(idx, 1)
                                setExpensesDraft(arr)
                              }}
                            >Delete</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <Label>Attachments</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {(attachments || []).length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : attachments.map((a:any, i:number)=> (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!a.file_key) return
                      try {
                        const response = await fetch(`/api/storage/signed-url?path=${encodeURIComponent(a.file_key)}`)
                        if (!response.ok) {
                          throw new Error('Failed to get signed URL')
                        }
                        const { url, error } = await response.json()
                        if (error || !url) {
                          throw new Error(error || 'No URL returned')
                        }
                        const link = document.createElement('a')
                        link.href = url
                        link.target = '_blank'
                        link.rel = 'noopener noreferrer'
                        link.download = a.file_key.split('/').pop() || 'file'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      } catch (error) {
                        console.error('Error opening file:', error)
                        alert(`Failed to open file`)
                      }
                    }}
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    {a.file_key.split('/').pop() || 'Original File'}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
