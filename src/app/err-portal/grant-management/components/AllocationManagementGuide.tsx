'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const NOTE_STYLES = [
  'bg-sky-50 border-sky-100',
  'bg-emerald-50 border-emerald-100',
  'bg-amber-50 border-amber-100',
] as const

type StateRow = {
  state_name: string
  remaining?: number
  allocated?: number
}

type GrantRow = {
  grant_id: string
  balance: number
  total_transferred_amount_usd: number
}

type FspRow = {
  id: string
  name: string
  treasury_in_usd?: number | null
  treasury_out_usd?: number | null
  balance?: number
}

const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)

function BalanceList({
  rows,
  empty,
}: {
  rows: { key: string; label: string; value: number; warn?: boolean }[]
  empty: string
}) {
  if (!rows.length) {
    return <p className="text-[10px] text-muted-foreground">{empty}</p>
  }
  return (
    <ul className="space-y-0.5 max-h-40 overflow-y-auto">
      {rows.map((r) => (
        <li key={r.key} className="flex items-baseline justify-between gap-2 text-[10px]">
          <span className="truncate text-foreground/90" title={r.label}>
            {r.label}
          </span>
          <span
            className={`shrink-0 font-medium tabular-nums ${
              r.warn ? 'text-red-700' : 'text-foreground'
            }`}
          >
            {money(r.value)}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function AllocationManagementGuide() {
  const { t } = useTranslation(['err'])
  const [open, setOpen] = useState(true)
  const [states, setStates] = useState<StateRow[]>([])
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [fsps, setFsps] = useState<FspRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const [sRes, gRes, fRes] = await Promise.all([
          fetch('/api/pool/by-state', { cache: 'no-store' }),
          fetch('/api/dashboard/grants-chart', { cache: 'no-store' }),
          fetch('/api/fsps', { cache: 'no-store' }),
        ])
        const [s, g, f] = await Promise.all([
          sRes.ok ? sRes.json() : [],
          gRes.ok ? gRes.json() : [],
          fRes.ok ? fRes.json() : [],
        ])
        if (cancelled) return
        setStates(Array.isArray(s) ? s : [])
        setGrants(Array.isArray(g) ? g : [])
        setFsps(Array.isArray(f) ? f : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const notes = [
    {
      title: t('err:allocation_guide_section_pool'),
      body: t('err:allocation_guide_pool_body'),
    },
    {
      title: t('err:allocation_guide_section_grants'),
      body: t('err:allocation_guide_grants_body'),
    },
    {
      title: t('err:allocation_guide_section_fr'),
      body: t('err:allocation_guide_fr_body'),
    },
  ]

  const stateRows = useMemo(
    () =>
      [...states]
        .map((r) => ({
          key: r.state_name,
          label: r.state_name,
          value: Number(r.remaining) || 0,
          warn: (Number(r.remaining) || 0) < 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [states]
  )

  const grantRows = useMemo(
    () =>
      [...grants]
        .map((r) => ({
          key: r.grant_id,
          label: r.grant_id,
          value: Number(r.balance) || 0,
          warn: (Number(r.balance) || 0) < 0,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 12),
    [grants]
  )

  const fspRows = useMemo(
    () =>
      [...fsps]
        .map((r) => {
          const inn = Number(r.treasury_in_usd) || 0
          const out = Number(r.treasury_out_usd) || 0
          const bal = r.balance != null ? Number(r.balance) : inn - out
          return {
            key: r.id,
            label: r.name,
            value: bal,
            warn: bal < 0,
          }
        })
        .sort((a, b) => b.value - a.value),
    [fsps]
  )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          {t('err:allocation_guide_title')}
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
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
            <Badge
              variant="outline"
              className="h-5 border-amber-300 bg-amber-100 text-[10px] text-amber-900"
            >
              {t('err:allocation_guide_guidance_badge')}
            </Badge>
            <span>{t('err:allocation_guide_guidance_body')}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {notes.map((note, i) => (
              <div
                key={note.title}
                className={`rounded-md border px-2.5 py-2 shadow-sm ${NOTE_STYLES[i % NOTE_STYLES.length]}`}
              >
                <h4 className="text-[11px] font-semibold text-foreground leading-tight mb-1">
                  {note.title}
                </h4>
                <p className="text-[10px] leading-snug text-muted-foreground">{note.body}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-md border bg-card px-2.5 py-2 shadow-sm">
              <h4 className="text-[11px] font-semibold mb-0.5">
                {t('err:allocation_guide_draw_states')}
              </h4>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {t('err:allocation_guide_draw_states_hint')}
              </p>
              {loading ? (
                <p className="text-[10px] text-muted-foreground">Loading…</p>
              ) : (
                <BalanceList rows={stateRows} empty={t('err:allocation_guide_draw_empty')} />
              )}
            </div>
            <div className="rounded-md border bg-card px-2.5 py-2 shadow-sm">
              <h4 className="text-[11px] font-semibold mb-0.5">
                {t('err:allocation_guide_draw_grants')}
              </h4>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {t('err:allocation_guide_draw_grants_hint')}
              </p>
              {loading ? (
                <p className="text-[10px] text-muted-foreground">Loading…</p>
              ) : (
                <BalanceList rows={grantRows} empty={t('err:allocation_guide_draw_empty')} />
              )}
            </div>
            <div className="rounded-md border bg-card px-2.5 py-2 shadow-sm">
              <h4 className="text-[11px] font-semibold mb-0.5">
                {t('err:allocation_guide_draw_fsps')}
              </h4>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {t('err:allocation_guide_draw_fsps_hint')}
              </p>
              {loading ? (
                <p className="text-[10px] text-muted-foreground">Loading…</p>
              ) : (
                <BalanceList rows={fspRows} empty={t('err:allocation_guide_draw_empty')} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
