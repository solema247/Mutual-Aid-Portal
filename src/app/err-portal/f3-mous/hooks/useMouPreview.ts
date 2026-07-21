'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  aggregateObjectives,
  aggregateBeneficiaries,
  aggregatePlannedActivities,
  aggregatePlannedActivitiesDetailed,
  aggregateLocations,
  getBankingDetails,
  getBudgetTable,
  getBudgetTableData,
} from '@/lib/mou-aggregation'
import { hasArabic } from '../lib/mou-preview-helpers'
import { buildEditingMouForEdit } from '../lib/mou-preview-helpers'
import type { MOU, MOUDetail, MouPreviewTranslations } from '../types'

export const PREVIEW_ID = 'mou-preview-content'

interface UseMouPreviewOptions {
  fetchMous: () => Promise<void>
}

export function useMouPreview({ fetchMous }: UseMouPreviewOptions) {
  const { t } = useTranslation(['f3'])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeMou, setActiveMou] = useState<MOU | null>(null)
  const [detail, setDetail] = useState<MOUDetail | null>(null)
  const [translations, setTranslations] = useState<MouPreviewTranslations>({})
  const [exporting, setExporting] = useState(false)
  const [forceBudgetExpanded, setForceBudgetExpanded] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editingMou, setEditingMou] = useState<Partial<MOU>>({})
  const [saving, setSaving] = useState(false)

  const aggregatedData = useMemo(() => {
    const projects = detail?.projects || (detail?.project ? [detail.project] : [])
    if (projects.length === 0) {
      return {
        objectives: null,
        beneficiaries: null,
        activities: null,
        activitiesDetailed: null,
        locations: { localities: '', state: null as string | null },
        banking: null as string | null,
        budgetTable: null as string | null,
        budgetTableData: null,
      }
    }

    return {
      objectives: aggregateObjectives(projects),
      beneficiaries: aggregateBeneficiaries(projects),
      activities: aggregatePlannedActivities(projects),
      activitiesDetailed: aggregatePlannedActivitiesDetailed(projects),
      locations: aggregateLocations(projects),
      banking: getBankingDetails(projects),
      budgetTable: getBudgetTable(projects),
      budgetTableData: getBudgetTableData(projects),
    }
  }, [detail])

  const openPreview = async (m: MOU) => {
    setActiveMou(m)
    setEditMode(false)
    setEditingMou({})
    setPreviewOpen(true)
    try {
      const res = await fetch(`/api/f3/mous/${m.id}`)
      const data = await res.json()
      setDetail(data)
      if (data.mou) {
        setActiveMou(data.mou)
      }
      const projects = data?.projects || (data?.project ? [data.project] : [])
      const objStr = aggregateObjectives(projects) || ''
      const benStr = aggregateBeneficiaries(projects) || ''
      const actStr =
        aggregatePlannedActivitiesDetailed(projects) || aggregatePlannedActivities(projects) || ''

      const translate = async (q: string, source: 'ar' | 'en', target: 'ar' | 'en') => {
        try {
          const r = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q, source, target, format: 'text' }),
          })
          const j = await r.json()
          return j?.translatedText || q
        } catch {
          return q
        }
      }

      const newTx: MouPreviewTranslations = {}
      if (objStr) {
        if (hasArabic(objStr)) {
          newTx.objectives_ar = objStr
          newTx.objectives_en = await translate(objStr, 'ar', 'en')
        } else {
          newTx.objectives_en = objStr
          newTx.objectives_ar = await translate(objStr, 'en', 'ar')
        }
      }
      if (benStr) {
        if (hasArabic(benStr)) {
          newTx.beneficiaries_ar = benStr
          newTx.beneficiaries_en = await translate(benStr, 'ar', 'en')
        } else {
          newTx.beneficiaries_en = benStr
          newTx.beneficiaries_ar = await translate(benStr, 'en', 'ar')
        }
      }
      if (actStr) {
        if (hasArabic(actStr)) {
          newTx.activities_ar = actStr
          newTx.activities_en = await translate(actStr, 'ar', 'en')
        } else {
          newTx.activities_en = actStr
          newTx.activities_ar = await translate(actStr, 'en', 'ar')
        }
      }
      setTranslations(newTx)
    } catch (e) {
      console.error('Failed loading detail', e)
    }
  }

  const handlePreviewOpenChange = (open: boolean) => {
    setPreviewOpen(open)
    if (!open) {
      setEditMode(false)
      setEditingMou({})
    }
  }

  const handleSave = async () => {
    if (!activeMou) return
    try {
      setSaving(true)
      const response = await fetch(`/api/f3/mous/${activeMou.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMou),
      })
      if (!response.ok) {
        throw new Error('Failed to save changes')
      }
      const updated = await response.json()
      setActiveMou(updated)
      setEditMode(false)
      setEditingMou({})
      await fetchMous()
      alert('MOU updated successfully')
    } catch (error) {
      console.error('Error saving MOU:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const startEditMode = () => {
    if (!activeMou) return
    setEditMode(true)
    setEditingMou(buildEditingMouForEdit(activeMou, detail, aggregatedData.banking))
  }

  return {
    previewOpen,
    setPreviewOpen,
    activeMou,
    setActiveMou,
    detail,
    translations,
    exporting,
    setExporting,
    forceBudgetExpanded,
    setForceBudgetExpanded,
    editMode,
    setEditMode,
    editingMou,
    setEditingMou,
    saving,
    setSaving,
    previewId: PREVIEW_ID,
    aggregatedData,
    t,
    openPreview,
    handlePreviewOpenChange,
    handleSave,
    startEditMode,
    fetchMous,
  }
}

export type MouPreviewState = ReturnType<typeof useMouPreview>
