'use client'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

export const FORECAST_CHART_IDS = [
  'status-by-month',
  'sankey',
  'state-support',
  'source-by-month',
  'receiving-mag',
] as const

export type ForecastChartId = (typeof FORECAST_CHART_IDS)[number]

const SAFE_FALLBACK_COLOR = 'rgb(0,0,0)'
const SAFE_FALLBACK_BG = '#ffffff'

function safeColor(value: string | null, prop?: string): string | null {
  if (value == null || value === '') return value
  if (!value.includes('oklch') && !value.includes('var(')) return value
  const isBg =
    prop === 'background' ||
    prop === 'background-color' ||
    prop === 'backgroundColor' ||
    (prop?.toLowerCase().includes('background') ?? false)
  return isBg ? SAFE_FALLBACK_BG : SAFE_FALLBACK_COLOR
}

/** Copy computed styles from original to clone and strip oklch/var so html2canvas only sees rgb */
function copyComputedStylesRecursive(orig: HTMLElement, clone: HTMLElement): void {
  const cs = getComputedStyle(orig)
  clone.style.cssText = ''
  clone.style.backgroundColor = SAFE_FALLBACK_BG
  const style = clone.style
  for (let i = 0; i < cs.length; i++) {
    const prop = cs[i]
    const value = cs.getPropertyValue(prop)
    const safe = value ? safeColor(value, prop) : null
    if (safe != null) style.setProperty(prop, safe)
  }
  const colorAttrs = ['fill', 'stroke', 'stop-color', 'color']
  for (const attr of colorAttrs) {
    const cloneVal = clone.getAttribute(attr)
    if (cloneVal != null && (cloneVal.includes('oklch') || cloneVal.includes('var('))) {
      const computed = cs.getPropertyValue(attr)
      clone.setAttribute(attr, safeColor(computed) ?? SAFE_FALLBACK_COLOR)
    }
  }
  const origChildren = Array.from(orig.children) as HTMLElement[]
  const cloneChildren = Array.from(clone.children) as HTMLElement[]
  for (let i = 0; i < Math.min(origChildren.length, cloneChildren.length); i++) {
    copyComputedStylesRecursive(origChildren[i], cloneChildren[i])
  }
}

/** Fix tooltip and legend vertical alignment in clone only (PDF capture) so color box and text align and don't clip. */
function fixPdfCloneAlignment(clone: HTMLElement, chartId: ForecastChartId): void {
  if (chartId !== 'state-support') return
  const alignRow = (el: HTMLElement) => {
    el.style.display = 'flex'
    el.style.alignItems = 'center'
    el.style.lineHeight = '1.2'
    el.style.minHeight = '1.25rem'
  }
  const tooltipPanel = clone.querySelector('[class*="absolute"][class*="right-3"]') as HTMLElement | null
  if (tooltipPanel) {
    tooltipPanel.style.overflow = 'visible'
    const grid = tooltipPanel.querySelector('[class*="grid"]') as HTMLElement | null
    if (grid) {
      grid.style.overflow = 'visible'
      const rows = grid.querySelectorAll(':scope > div')
      rows.forEach((row) => alignRow(row as HTMLElement))
    }
    tooltipPanel.querySelectorAll('.flex.items-center').forEach((row) => {
      const el = row as HTMLElement
      el.style.display = 'flex'
      el.style.alignItems = 'center'
    })
  }
  const legend = clone.querySelector('[aria-label="Legend"]') as HTMLElement | null
  if (legend) {
    legend.style.overflow = 'visible'
    legend.style.gridTemplateRows = 'repeat(3, 1.25rem)'
    const items = legend.querySelectorAll('[role="listitem"]')
    items.forEach((item) => alignRow(item as HTMLElement))
  }
}

const CHART_LABELS: Record<ForecastChartId, string> = {
  'status-by-month': 'Mutual Aid forecast by status and month',
  sankey: 'Funding Flows',
  'state-support': 'State-level Support',
  'source-by-month': 'Funding Sources by month',
  'receiving-mag': 'Receiving MAG by month',
}

const PDF_TITLE = 'Mutual Aid Portal - Donor Forecast Charts'

const PDF_CAPTURE_SHOW_LAST_MONTH = 'pdf-capture-show-last-month'

/** Dispatch so charts can show tooltip for latest month in dataset (e.g. state-support pins last month). */
function dispatchPdfShowLastMonth(chartId: ForecastChartId): void {
  window.dispatchEvent(new CustomEvent(PDF_CAPTURE_SHOW_LAST_MONTH, { detail: { chartId } }))
}

/** Show last-month tooltip before PDF capture (excludes Sankey and status-by-month). Area charts: hover last dot in data order. */
async function showLastMonthTooltipIfNeeded(el: HTMLElement, chartId: ForecastChartId): Promise<void> {
  if (chartId === 'sankey' || chartId === 'status-by-month') return
  if (chartId === 'state-support') {
    return
  }
  if (chartId === 'source-by-month' || chartId === 'receiving-mag') {
    const dots = el.querySelectorAll('.recharts-area-dot')
    const lastDot = dots.length > 0 ? dots[dots.length - 1] : null
    if (lastDot instanceof HTMLElement) {
      lastDot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
      lastDot.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

function arrayToCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell)
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`
          }
          return s
        })
        .join(',')
    )
    .join('\n')
}

export type ChartDataResult = { filename: string; csv: string; rows: (string | number)[][] }

async function fetchCsvForChart(chartId: ForecastChartId): Promise<ChartDataResult | null> {
  try {
    switch (chartId) {
      case 'status-by-month': {
        const res = await fetch('/api/forecast/summary')
        if (!res.ok) return null
        const data = (await res.json()) as { month?: string; complete?: number; planned?: number }[]
        const rows = [['month', 'complete', 'planned'], ...(data || []).map((r) => [r.month ?? '', r.complete ?? 0, r.planned ?? 0])]
        return { filename: 'forecast-status-by-month.csv', csv: arrayToCsv(rows), rows }
      }
      case 'state-support': {
        const res = await fetch('/api/forecast/state-support')
        if (!res.ok) return null
        const data = (await res.json()) as { month?: string; state_name?: string; amount?: number }[]
        const rows = [['month', 'state_name', 'amount'], ...(data || []).map((r) => [r.month ?? '', r.state_name ?? '', r.amount ?? 0])]
        return { filename: 'forecast-state-support.csv', csv: arrayToCsv(rows), rows }
      }
      case 'source-by-month': {
        const res = await fetch('/api/forecast/source-by-month')
        if (!res.ok) return null
        const data = (await res.json()) as { month?: string; source?: string; amount?: number }[]
        const rows = [['month', 'source', 'amount'], ...(data || []).map((r) => [r.month ?? '', r.source ?? '', r.amount ?? 0])]
        return { filename: 'forecast-funding-sources.csv', csv: arrayToCsv(rows), rows }
      }
      case 'receiving-mag': {
        const res = await fetch('/api/forecast/receiving-mag-by-month')
        if (!res.ok) return null
        const data = (await res.json()) as { month?: string; receiving_mag?: string; amount?: number }[]
        const rows = [['month', 'receiving_mag', 'amount'], ...(data || []).map((r) => [r.month ?? '', r.receiving_mag ?? '', r.amount ?? 0])]
        return { filename: 'forecast-receiving-mag.csv', csv: arrayToCsv(rows), rows }
      }
      case 'sankey': {
        const res = await fetch('/api/forecast/sankey')
        if (!res.ok) return null
        const data = (await res.json()) as { nodes?: { name: string }[]; links?: { source: number; target: number; value: number }[] }
        const nodes = data?.nodes ?? []
        const links = data?.links ?? []
        const rows = [
          ['source', 'target', 'value'],
          ...links.map((l) => [
            nodes[l.source]?.name ?? String(l.source),
            nodes[l.target]?.name ?? String(l.target),
            l.value,
          ]),
        ]
        return { filename: 'forecast-sankey-links.csv', csv: arrayToCsv(rows), rows }
      }
      default:
        return null
    }
  } catch {
    return null
  }
}

/** Excel sheet names: max 31 chars, no \ / ? * [ ] */
function sheetName(label: string): string {
  return label
    .replace(/[\\/?*[\]]/g, ' ')
    .slice(0, 31)
    .trim() || 'Sheet'
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function ForecastDownloadModal() {
  const { t } = useTranslation(['forecast', 'common'])
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf')
  const [selected, setSelected] = useState<Set<ForecastChartId>>(new Set(FORECAST_CHART_IDS))
  const [downloading, setDownloading] = useState(false)

  const allSelected = selected.size === FORECAST_CHART_IDS.length
  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(FORECAST_CHART_IDS))
  }, [allSelected])

  const toggleChart = useCallback((id: ForecastChartId) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDownload = useCallback(async () => {
    const list = FORECAST_CHART_IDS.filter((id) => selected.has(id))
    if (list.length === 0) return
    setDownloading(true)
    try {
      if (format === 'csv') {
        if (list.length === 1) {
          const result = await fetchCsvForChart(list[0])
          if (result) downloadCsv(result.filename, result.csv)
        } else {
          const results = await Promise.all(list.map((id) => fetchCsvForChart(id)))
          const withRows = list
            .map((id, i) => ({ id, result: results[i] }))
            .filter((r): r is { id: ForecastChartId; result: ChartDataResult } => r.result != null)
          if (withRows.length === 0) return
          const wb = XLSX.utils.book_new()
          for (const { id, result } of withRows) {
            const ws = XLSX.utils.aoa_to_sheet(result.rows)
            XLSX.utils.book_append_sheet(wb, ws, sheetName(CHART_LABELS[id]))
          }
          XLSX.writeFile(wb, 'forecast-charts.xlsx')
        }
      } else {
        const MM_PER_PX = 25.4 / 96
        const canvases: { imgData: string; widthMm: number; heightMm: number }[] = []
        for (const id of list) {
          const el = document.querySelector(`[data-download-chart="${id}"]`) as HTMLElement | null
          if (!el) continue
          dispatchPdfShowLastMonth(id)
          await new Promise((r) => setTimeout(r, 350))
          await showLastMonthTooltipIfNeeded(el, id)
          const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            onclone(clonedDoc, clonedEl) {
              clonedDoc.querySelectorAll('link[rel="stylesheet"], style').forEach((s) => s.remove())
              clonedEl.style.backgroundColor = '#ffffff'
              copyComputedStylesRecursive(el, clonedEl)
              fixPdfCloneAlignment(clonedEl, id)
            },
          })
          const imgData = canvas.toDataURL('image/png')
          canvases.push({
            imgData,
            widthMm: canvas.width * MM_PER_PX,
            heightMm: canvas.height * MM_PER_PX,
          })
        }
        if (canvases.length === 0) return
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        const margin = 10
        const gap = 5
        const titleHeight = 12
        const innerW = pageW - 2 * margin
        const innerH = pageH - 2 * margin - titleHeight
        pdf.setFontSize(16)
        pdf.setFont('helvetica', 'bold')
        pdf.text(PDF_TITLE, margin, margin + 8)
        const n = canvases.length
        const numRows = Math.ceil((n + 1) / 2)
        const totalMinusGaps = innerH - (numRows - 1) * gap
        const middleRowScale = 1.4
        const baseRowH = totalMinusGaps / (numRows - 1 + middleRowScale)
        const middleRowH = baseRowH * middleRowScale
        const rowHeights: number[] = Array(numRows).fill(baseRowH)
        if (numRows >= 2) rowHeights[1] = middleRowH
        const cellW2 = (innerW - gap) / 2
        const yBase = margin + titleHeight
        for (let i = 0; i < n; i++) {
          const { imgData, widthMm, heightMm } = canvases[i]
          const isFirstRow = i === 0
          const cellW = isFirstRow ? innerW : cellW2
          const rowIndex = isFirstRow ? 0 : Math.floor((i - 1) / 2) + 1
          const cellH = rowHeights[rowIndex]
          const scale = Math.min(cellW / widthMm, cellH / heightMm, 1)
          const w = widthMm * scale
          const h = heightMm * scale
          let x: number
          let y: number
          if (isFirstRow) {
            x = margin + (innerW - w) / 2
            y = yBase + (cellH - h) / 2
          } else {
            const row = Math.floor((i - 1) / 2) + 1
            const col = (i - 1) % 2
            let yRowStart = yBase
            for (let r = 0; r < row; r++) yRowStart += rowHeights[r] + gap
            x = margin + col * (cellW2 + gap) + (cellW2 - w) / 2
            y = yRowStart + (cellH - h) / 2
          }
          pdf.addImage(imgData, 'PNG', x, y, w, h)
        }
        pdf.save('forecast-charts.pdf')
      }
      setOpen(false)
    } finally {
      setDownloading(false)
    }
  }, [format, selected])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="size-4" />
          {t('forecast:download', 'Download')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-white text-slate-900 border border-slate-200 shadow-xl">
        <DialogHeader>
          <DialogTitle>{t('forecast:download_modal_title', 'Download charts or data')}</DialogTitle>
          <DialogDescription>
            {t('forecast:download_modal_desc', 'Choose format and which charts to include.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label className="text-sm font-medium">{t('forecast:download_format', 'Format')}</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="rounded-full border-input"
                />
                <span className="text-sm">{t('forecast:download_pdf', 'PDF of charts')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="format"
                  checked={format === 'csv'}
                  onChange={() => setFormat('csv')}
                  className="rounded-full border-input"
                />
                <span className="text-sm">{t('forecast:download_csv', 'CSV with chart data')}</span>
              </label>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('forecast:download_charts', 'Charts to include')}</Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                <span className="text-xs text-muted-foreground">{t('forecast:select_all', 'Select all')}</span>
              </label>
            </div>
            <div className="grid gap-2 max-h-[240px] overflow-y-auto border border-border/50 rounded-md p-3">
              {FORECAST_CHART_IDS.map((id) => (
                <label key={id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selected.has(id)}
                    onCheckedChange={() => toggleChart(id)}
                  />
                  <span className="text-sm">{CHART_LABELS[id]}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common:cancel', 'Cancel')}
          </Button>
          <Button onClick={handleDownload} disabled={downloading || selected.size === 0}>
            {downloading ? t('common:loading') : t('forecast:download_confirm', 'Download')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
