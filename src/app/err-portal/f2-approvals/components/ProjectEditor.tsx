'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabaseClient'

type Expense = { activity: string; total_cost: number }

interface ProjectEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string | null
  onSaved?: () => void
}

export default function ProjectEditor({ open, onOpenChange, projectId, onSaved }: ProjectEditorProps) {
  const { t } = useTranslation(['projects', 'common'])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<any>({})
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [activities, setActivities] = useState<string[]>([])

  useEffect(() => {
    const load = async () => {
      if (!open || !projectId) return
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('err_projects')
          .select(`
            id, date, state, locality, status, language,
            project_objectives, intended_beneficiaries, estimated_beneficiaries,
            estimated_timeframe, additional_support, banking_details,
            program_officer_name, program_officer_phone,
            reporting_officer_name, reporting_officer_phone,
            finance_officer_name, finance_officer_phone,
            planned_activities, expenses
          `)
          .eq('id', projectId)
          .single()
        if (error) throw error
        setForm(data)
        setExpenses(Array.isArray(data?.expenses) ? data.expenses : (typeof data?.expenses === 'string' ? JSON.parse(data?.expenses || '[]') : []))
        const pa = Array.isArray(data?.planned_activities) ? data.planned_activities : (typeof data?.planned_activities === 'string' ? JSON.parse(data?.planned_activities || '[]') : [])
        setActivities(pa)
      } catch (e) {
        console.error('Load project error', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [open, projectId])

  const updateField = (key: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [key]: value }))
  }

  const updateExpense = (idx: number, key: keyof Expense, value: any) => {
    setExpenses(prev => prev.map((e, i) => i === idx ? { ...e, [key]: key === 'total_cost' ? Number(value) || 0 : value } : e))
  }

  const addExpense = () => setExpenses(prev => [...prev, { activity: '', total_cost: 0 }])
  const removeExpense = (idx: number) => setExpenses(prev => prev.filter((_, i) => i !== idx))

  const total = expenses.reduce((s, e) => s + (e.total_cost || 0), 0)

  const save = async () => {
    if (!projectId) return
    setSaving(true)
    try {
      const payload: any = {
        project_objectives: form.project_objectives || null,
        intended_beneficiaries: form.intended_beneficiaries || null,
        estimated_beneficiaries: form.estimated_beneficiaries ?? null,
        estimated_timeframe: form.estimated_timeframe || null,
        additional_support: form.additional_support || null,
        banking_details: form.banking_details || null,
        program_officer_name: form.program_officer_name || null,
        program_officer_phone: form.program_officer_phone || null,
        reporting_officer_name: form.reporting_officer_name || null,
        reporting_officer_phone: form.reporting_officer_phone || null,
        finance_officer_name: form.finance_officer_name || null,
        finance_officer_phone: form.finance_officer_phone || null,
        planned_activities: activities,
        expenses
      }
      const { error } = await supabase
        .from('err_projects')
        .update(payload)
        .eq('id', projectId)
      if (error) throw error
      onSaved?.()
      onOpenChange(false)
    } catch (e) {
      console.error('Save project error', e)
      alert('Failed to save project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('projects:project_details')}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground">{t('common:loading')}</div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>{t('projects:date')}</Label>
                <Input value={form.date || ''} onChange={(e) => updateField('date', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:state') || 'State'}</Label>
                <Input value={form.state || ''} onChange={(e) => updateField('state', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:location')}</Label>
                <Input value={form.locality || ''} onChange={(e) => updateField('locality', e.target.value)} />
              </div>
            </div>

            <div>
              <Label>{t('projects:objectives')}</Label>
              <Textarea value={form.project_objectives || ''} onChange={(e) => updateField('project_objectives', e.target.value)} className="min-h-[100px]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:intended_beneficiaries')}</Label>
                <Textarea value={form.intended_beneficiaries || ''} onChange={(e) => updateField('intended_beneficiaries', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:estimated_number')}</Label>
                <Input type="number" value={form.estimated_beneficiaries || ''} onChange={(e) => updateField('estimated_beneficiaries', parseInt(e.target.value))} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:estimated_timeframe')}</Label>
                <Input value={form.estimated_timeframe || ''} onChange={(e) => updateField('estimated_timeframe', e.target.value)} />
              </div>
              <div>
                <Label>{t('projects:additional_support')}</Label>
                <Input value={form.additional_support || ''} onChange={(e) => updateField('additional_support', e.target.value)} />
              </div>
            </div>

            <div>
              <Label>{t('projects:banking_details')}</Label>
              <Textarea value={form.banking_details || ''} onChange={(e) => updateField('banking_details', e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>{t('projects:officer')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t('common:name') || 'Name'} value={form.program_officer_name || ''} onChange={(e) => updateField('program_officer_name', e.target.value)} />
                  <Input placeholder={t('common:phone') || 'Phone'} value={form.program_officer_phone || ''} onChange={(e) => updateField('program_officer_phone', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{t('projects:reporting_officer', { defaultValue: 'Reporting Officer' })}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t('common:name') || 'Name'} value={form.reporting_officer_name || ''} onChange={(e) => updateField('reporting_officer_name', e.target.value)} />
                  <Input placeholder={t('projects:phone', { defaultValue: t('common:phone') || 'Phone' })} value={form.reporting_officer_phone || ''} onChange={(e) => updateField('reporting_officer_phone', e.target.value)} />
                </div>
              </div>
              <div>
                <Label>{t('projects:finance_officer', { defaultValue: 'Finance Officer' })}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder={t('common:name') || 'Name'} value={form.finance_officer_name || ''} onChange={(e) => updateField('finance_officer_name', e.target.value)} />
                  <Input placeholder={t('projects:phone', { defaultValue: t('common:phone') || 'Phone' })} value={form.finance_officer_phone || ''} onChange={(e) => updateField('finance_officer_phone', e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>{t('projects:planned_activities')}</Label>
                <Button variant="outline" size="sm" onClick={() => setActivities(prev => [...prev, ''])}>{t('projects:add_activity')}</Button>
              </div>
              <div className="mt-2 space-y-2">
                {activities.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <Input value={a} onChange={(e) => setActivities(prev => prev.map((v, idx) => idx === i ? e.target.value : v))} />
                    <Button variant="outline" size="sm" onClick={() => setActivities(prev => prev.filter((_, idx) => idx !== i))}>{t('projects:remove_activity')}</Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label>{t('projects:expenses')}</Label>
                <div className="text-sm text-muted-foreground">{t('projects:total')}: {total.toLocaleString()}</div>
              </div>
              <div className="mt-2 space-y-2">
                {expenses.map((e, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2">
                    <Input placeholder={t('projects:activity') || 'Activity'} value={e.activity} onChange={(ev) => updateExpense(i, 'activity', ev.target.value)} />
                    <Input type="number" placeholder={t('projects:amount') || 'Amount'} value={e.total_cost} onChange={(ev) => updateExpense(i, 'total_cost', ev.target.value)} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => removeExpense(i)}>{t('projects:remove_expense')}</Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addExpense}>{t('projects:add_expense')}</Button>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('projects:cancel', { defaultValue: t('common:cancel') || 'Cancel' })}</Button>
              <Button onClick={save} disabled={saving}>{saving ? (t('common:saving') || 'Saving…') : t('projects:save_changes')}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


