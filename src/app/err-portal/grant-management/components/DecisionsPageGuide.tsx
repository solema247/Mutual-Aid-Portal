'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'

const NOTE_STYLES = [
  'bg-sky-50 border-sky-100',
  'bg-emerald-50 border-emerald-100',
  'bg-amber-50 border-amber-100',
  'bg-violet-50 border-violet-100',
  'bg-rose-50 border-rose-100',
] as const

export default function DecisionsPageGuide() {
  const { t } = useTranslation(['err'])
  const [open, setOpen] = useState(true)

  const notes = [
    {
      title: t('err:decisions_guide_section_decisions'),
      body: <p>{t('err:decisions_guide_decisions_body')}</p>,
    },
    {
      title: t('err:decisions_guide_section_managing'),
      body: (
        <div className="space-y-1.5">
          <p><strong>{t('err:decisions_guide_amounts_label')}</strong> {t('err:decisions_guide_amounts_body')}</p>
          <p><strong>{t('err:decisions_guide_how_to_label')}</strong> {t('err:decisions_guide_how_to_body')}</p>
          <p><strong>{t('err:decisions_guide_documents_label')}</strong> {t('err:decisions_guide_documents_body')}</p>
        </div>
      ),
    },
    {
      title: t('err:decisions_guide_section_workflow'),
      body: (
        <div className="text-[10px]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-0.5 pr-1 font-semibold">{t('err:decisions_guide_workflow_stage')}</th>
                <th className="text-left py-0.5 pr-1 font-semibold">{t('err:decisions_guide_workflow_status')}</th>
                <th className="text-left py-0.5 font-semibold">{t('err:decisions_guide_workflow_funding')}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-0.5 pr-1">F1</td>
                <td className="py-0.5 pr-1">pending</td>
                <td className="py-0.5">unassigned</td>
              </tr>
              <tr className="border-b">
                <td className="py-0.5 pr-1">F2 commit</td>
                <td className="py-0.5 pr-1">approved</td>
                <td className="py-0.5">committed</td>
              </tr>
              <tr className="border-b">
                <td className="py-0.5 pr-1">F2/F3 assign</td>
                <td className="py-0.5 pr-1">approved</td>
                <td className="py-0.5">assigned</td>
              </tr>
              <tr className="border-b">
                <td className="py-0.5 pr-1">Active</td>
                <td className="py-0.5 pr-1">active</td>
                <td className="py-0.5">assigned</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-1">F4/F5 complete</td>
                <td className="py-0.5 pr-1">complete</td>
                <td className="py-0.5">assigned</td>
              </tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      title: t('err:decisions_guide_section_pool'),
      body: (
        <ul className="space-y-0.5">
          <li>
            <span className="font-medium text-foreground/90">
              {t('err:decisions_guide_pool_assigned_label')}
            </span>
            {' — '}
            {t('err:decisions_guide_pool_assigned')}
          </li>
          <li>
            <span className="font-medium text-foreground/90">
              {t('err:decisions_guide_pool_available_label')}
            </span>
            {' — '}
            {t('err:decisions_guide_pool_available')}
          </li>
          <li>
            <span className="font-medium text-foreground/90">
              {t('err:decisions_guide_pool_committed_label')}
            </span>
            {' — '}
            {t('err:decisions_guide_pool_committed')}
          </li>
          <li>
            <span className="font-medium text-foreground/90">
              {t('err:decisions_guide_pool_pending_label')}
            </span>
            {' — '}
            {t('err:decisions_guide_pool_pending')}
          </li>
          <li>
            <span className="font-medium text-foreground/90">
              {t('err:decisions_guide_pool_balance_label')}
            </span>
            {' — '}
            {t('err:decisions_guide_pool_balance')}
          </li>
        </ul>
      ),
    },
  ]

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          {t('err:decisions_guide_title')}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {notes.map((note, i) => (
            <div
              key={note.title}
              className={`rounded-md border px-2.5 py-2 shadow-sm ${NOTE_STYLES[i % NOTE_STYLES.length]}`}
            >
              <h4 className="text-[11px] font-semibold text-foreground leading-tight mb-1">
                {note.title}
              </h4>
              <div className="text-[10px] leading-snug text-muted-foreground">{note.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
