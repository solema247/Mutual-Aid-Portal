'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Baby,
  BookOpen,
  Brain,
  Briefcase,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Droplets,
  FileDown,
  GraduationCap,
  HandCoins,
  Heart,
  Home,
  Layers,
  ShoppingBasket,
  Sprout,
  Truck,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Map as MapView, MapControls, MapClusterLayer, MapPopup, useMap } from '@/components/ui/map'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

type Mode = 'state' | 'theme'

/** Replace oklab/oklch/var() with rgb so html2canvas can parse (it doesn't support oklab). */
const PDF_SAFE_FALLBACK_COLOR = 'rgb(0,0,0)'
const PDF_SAFE_FALLBACK_BG = '#ffffff'
function safeColorForPdf(value: string | null, prop?: string): string | null {
  if (value == null || value === '') return value
  if (!value.includes('oklch') && !value.includes('oklab') && !value.includes('var(')) return value
  const isBg =
    prop === 'background' ||
    prop === 'background-color' ||
    prop === 'backgroundColor' ||
    (prop?.toLowerCase().includes('background') ?? false)
  return isBg ? PDF_SAFE_FALLBACK_BG : PDF_SAFE_FALLBACK_COLOR
}

/** Strip every style attribute in the subtree so html2canvas never sees oklab in inline styles. */
function stripAllStyleAttributes(el: HTMLElement): void {
  el.removeAttribute('style')
  for (const child of Array.from(el.children) as HTMLElement[]) {
    stripAllStyleAttributes(child)
  }
}

const COLOR_ATTRS = new Set(['fill', 'stroke', 'stop-color', 'color', 'background', 'background-color', 'border-color', 'outline-color'])
/** Replace oklab/oklch/var in any attribute value in the subtree (e.g. SVG or inline style leftovers). */
function sanitizeOklabInClone(el: HTMLElement): void {
  for (const name of el.getAttributeNames()) {
    const val = el.getAttribute(name)
    if (val && (val.includes('oklab') || val.includes('oklch') || val.includes('var('))) {
      const isColor = COLOR_ATTRS.has(name.toLowerCase()) || name.toLowerCase().includes('color') || name.toLowerCase().includes('fill') || name.toLowerCase().includes('stroke')
      el.setAttribute(name, isColor ? PDF_SAFE_FALLBACK_COLOR : val.replace(/oklab\([^)]*\)|oklch\([^)]*\)|var\([^)]*\)/g, '').trim() || '')
    }
  }
  for (const child of Array.from(el.children) as HTMLElement[]) {
    sanitizeOklabInClone(child)
  }
}

function copyComputedStylesForPdf(orig: HTMLElement, clone: HTMLElement): void {
  const cs = getComputedStyle(orig)
  clone.style.backgroundColor = PDF_SAFE_FALLBACK_BG
  const style = clone.style
  for (let i = 0; i < cs.length; i++) {
    const prop = cs[i]
    const value = cs.getPropertyValue(prop)
    const safe = value ? safeColorForPdf(value, prop) : null
    if (safe != null) style.setProperty(prop, safe)
  }
  const colorAttrs = ['fill', 'stroke', 'stop-color', 'color']
  for (const attr of colorAttrs) {
    const cloneVal = clone.getAttribute(attr)
    if (cloneVal != null && (cloneVal.includes('oklch') || cloneVal.includes('oklab') || cloneVal.includes('var('))) {
      const computed = cs.getPropertyValue(attr)
      clone.setAttribute(attr, safeColorForPdf(computed) ?? PDF_SAFE_FALLBACK_COLOR)
    }
  }
  const origChildren = Array.from(orig.children) as HTMLElement[]
  const cloneChildren = Array.from(clone.children) as HTMLElement[]
  for (let i = 0; i < Math.min(origChildren.length, cloneChildren.length); i++) {
    copyComputedStylesForPdf(origChildren[i], cloneChildren[i])
  }
}

/** Base map style options (mapcn Map styles prop: light/dark URLs). No 3D. */
const BASE_MAP_STYLES = {
  carto: undefined as undefined,
  openstreetmap: {
    light: 'https://tiles.openfreemap.org/styles/bright',
    dark: 'https://tiles.openfreemap.org/styles/bright',
  },
} as const
type BaseMapStyleKey = keyof typeof BASE_MAP_STYLES

interface StateOption {
  state: string
  project_count: number
  report_count: number
}

interface ThemeOption {
  id: string
  label: string
  project_count: number
}

interface StoryCard {
  project_id: string
  project_name: string | null
  state: string | null
  locality: string | null
  objectives_snippet: string
  positive_changes_snippet: string
  report_date: string | null
  reporting_person: string | null
  beneficiaries_count: number | null
  theme_labels: string[]
  primary_category?: string
  spend_diversity?: number
  language?: string
}

interface TopCategory {
  category: string
  total_usd: number
  other_subcategories?: string[]
}

interface StoriesSummary {
  total_projects: number
  total_reports: number
  total_beneficiaries: number
  total_households: number
  total_usd?: number
  locality_count: number
  localities: string[]
  top_categories?: TopCategory[]
}

/** Full story detail from /api/overview/project/[id] */
interface ReachRow {
  id?: string
  location?: string | null
  activity_name?: string | null
  activity_goal?: string | null
  individual_count?: number | null
  household_count?: number | null
}
interface F5ReportDetail {
  id: string
  report_date: string | null
  reporting_person: string | null
  positive_changes: string | null
  negative_results: string | null
  unexpected_results: string | null
  lessons_learned: string | null
  suggestions: string | null
  reach?: ReachRow[]
  /** When 'ar', UI may translate to EN when locale is en */
  language?: string
}
interface ProjectDetailProject {
  id: string
  state?: string | null
  locality?: string | null
  project_objectives?: string | null
  intended_beneficiaries?: string | null
  estimated_beneficiaries?: number | null
  estimated_timeframe?: string | null
  emergency_rooms?: { name?: string; name_ar?: string; err_code?: string } | null
}
interface ProjectDetailData {
  project: ProjectDetailProject
  f5Reports: F5ReportDetail[]
  is_historical: boolean
}

function formatDate(d: string | null | undefined): string {
  if (d == null || d === '') return ''
  try {
    const date = new Date(String(d))
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

/** Pastel palette for timeline dots by primary category. */
const CATEGORY_COLORS = [
  '#93c5fd', // pastel blue
  '#c4b5fd', // pastel violet
  '#86efac', // pastel green
  '#fca5a5', // pastel red
  '#fcd34d', // pastel amber
  '#67e8f9', // pastel cyan
  '#d8b4fe', // pastel purple
  '#93c5fd', // pastel blue alt
  '#fde047', // pastel yellow
  '#a5b4fc', // pastel indigo
]

function getCategoryColor(category: string, indexByCategory: Map<string, number>): string {
  let idx = indexByCategory.get(category)
  if (idx == null) {
    idx = indexByCategory.size
    indexByCategory.set(category, idx)
  }
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
}

function StorySection({
  title,
  content,
}: {
  title: string
  content: string | null | undefined
}) {
  const text = content?.trim()
  if (!text) return null
  return (
    <section className="mb-6">
      <h3 className="text-lg font-semibold mb-2 text-accent-foreground">{title}</h3>
      <p className="text-muted-foreground whitespace-pre-wrap text-sm leading-relaxed">{text}</p>
    </section>
  )
}

function HighlightedStoryContent({
  data,
  formatDate: fmt,
  showOnlyAtGlance = false,
}: {
  data: ProjectDetailData
  formatDate: (d: string | null | undefined) => string
  showOnlyAtGlance?: boolean
}) {
  const project = data.project
  const room = project.emergency_rooms
  const errName = room?.name || room?.name_ar || room?.err_code || null
  const latestReport = data.f5Reports[0] ?? null
  const title = project.locality || project.state || 'Story'

  const atGlanceItems: { label: string; value: string }[] = []
  if (project.estimated_beneficiaries != null) {
    atGlanceItems.push({
      label: 'Beneficiaries',
      value: project.estimated_beneficiaries.toLocaleString(),
    })
  }
  if (project.estimated_timeframe) {
    atGlanceItems.push({ label: 'Timeframe', value: project.estimated_timeframe })
  }
  if (latestReport?.reach?.length) {
    const totalIndividuals = latestReport.reach.reduce(
      (s, r) => s + (r.individual_count ?? 0),
      0
    )
    const totalHouseholds = latestReport.reach.reduce(
      (s, r) => s + (r.household_count ?? 0),
      0
    )
    if (totalIndividuals > 0) {
      atGlanceItems.push({
        label: 'Reach (individuals)',
        value: totalIndividuals.toLocaleString(),
      })
    }
    if (totalHouseholds > 0) {
      atGlanceItems.push({
        label: 'Households',
        value: totalHouseholds.toLocaleString(),
      })
    }
    atGlanceItems.push({
      label: 'Locations',
      value: String(new Set(latestReport.reach.map((r) => r.location).filter(Boolean)).size),
    })
  }

  return (
    <div className="space-y-6">
      <header>
        <h3 className="text-xl font-bold text-accent-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {[project.state, project.locality].filter(Boolean).join(' · ')}
          {errName ? ` · ${errName}` : ''}
        </p>
        {latestReport && (
          <p className="text-sm text-muted-foreground mt-1">
            Report: {fmt(latestReport.report_date)}
            {latestReport.reporting_person ? ` · ${latestReport.reporting_person}` : ''}
          </p>
        )}
      </header>

      {atGlanceItems.length > 0 && (
        <Card className="rounded-none border-0 shadow-md bg-sidebar text-sidebar-foreground py-0 gap-0">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-base text-white">At a glance</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 px-4 pb-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-white text-sm">
              {atGlanceItems.map(({ label, value }) => (
                <div key={label}>
                  <span className="text-white/80">{label}: </span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!showOnlyAtGlance && (
        <>
      <StorySection
        title="What we set out to do"
        content={project.project_objectives || project.intended_beneficiaries}
      />
      {latestReport && (
        <>
          <StorySection title="What changed" content={latestReport.positive_changes} />
          <StorySection title="Challenges" content={latestReport.negative_results} />
          <StorySection title="Unexpected results" content={latestReport.unexpected_results} />
          <StorySection title="Lessons learned" content={latestReport.lessons_learned} />
          <StorySection title="Suggestions" content={latestReport.suggestions} />
        </>
      )}

      {latestReport?.reach && latestReport.reach.length > 0 && (
        <Card className="rounded-none border-0 shadow-md bg-sidebar text-sidebar-foreground">
          <CardHeader className="py-2 px-4">
            <CardTitle className="text-base text-white">Where we worked</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 pb-3 px-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-sidebar-foreground/20 hover:bg-transparent">
                  <TableHead className="h-8 py-1.5 px-2 text-white font-semibold text-xs">Location</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-white font-semibold text-xs">Activity</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-white font-semibold text-xs">Goal</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-right text-white font-semibold text-xs">Individuals</TableHead>
                  <TableHead className="h-8 py-1.5 px-2 text-right text-white font-semibold text-xs">Households</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestReport.reach.map((r, i) => (
                  <TableRow key={r.id ?? i} className="border-white/20 text-white hover:bg-white/10">
                    <TableCell className="p-2 text-xs text-white">{r.location ?? '—'}</TableCell>
                    <TableCell className="p-2 text-xs text-white">{r.activity_name ?? '—'}</TableCell>
                    <TableCell className="p-2 text-xs text-white">{r.activity_goal ?? '—'}</TableCell>
                    <TableCell className="p-2 text-right text-xs text-white">
                      {r.individual_count != null ? r.individual_count.toLocaleString() : '—'}
                    </TableCell>
                    <TableCell className="p-2 text-right text-xs text-white">
                      {r.household_count != null ? r.household_count.toLocaleString() : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
        </>
      )}
    </div>
  )
}

/** Icons for narrative "Where support went" by sector name (sector_name_en). */
const SECTOR_ICONS: Record<string, LucideIcon> = {
  'Shelter centers': Home,
  'Volunteer support': Users,
  'Community kitchen': UtensilsCrossed,
  'Flexible': Layers,
  'Education': GraduationCap,
  'Livelihoods ': Briefcase,
  'Livelihoods': Briefcase,
  'Socioeconomic Empowerment': HandCoins,
  'Alternative education': BookOpen,
  'Agriculture Support': Sprout,
  'The needs of women and children': Baby,
  'Health support': Heart,
  'Youth Space': Users,
  'Evacuation': Truck,
  'Food baskets': ShoppingBasket,
  'WASH': Droplets,
  'Capacity building': BookOpen,
  'Mental and physical health': Brain,
  'Support logistic operations': Truck,
  'Other': Layers,
}

function getSectorIcon(category: string): LucideIcon {
  const key = category.startsWith('Other') ? 'Other' : category.trim()
  return SECTOR_ICONS[key] ?? Layers
}

/**
 * Spend diversity: 1 - Herfindahl index.
 * 0 = all spend in one category (concentrated), 1 = perfectly even across categories.
 */
function getSpendDiversityFromCategories(
  topCategories: { total_usd: number }[],
  totalUsd?: number
): number | null {
  if (topCategories.length === 0) return null
  const total = totalUsd ?? topCategories.reduce((s, tc) => s + tc.total_usd, 0)
  if (total <= 0) return null
  let herfindahl = 0
  for (const tc of topCategories) {
    const share = tc.total_usd / total
    herfindahl += share * share
  }
  return Math.min(1, Math.max(0, 1 - herfindahl))
}

/** Plain-English sentence describing how evenly spend was spread across sectors (diversity 0–1). */
function spendDiversityInWords(diversity: number): string {
  if (diversity >= 0.85) return 'Spend was spread fairly evenly across the sectors above.'
  if (diversity >= 0.6) return 'Spend was relatively well spread across several sectors.'
  if (diversity >= 0.35) return 'Spend was somewhat concentrated in a few main sectors.'
  return 'Spend was highly concentrated in one or two sectors.'
}

/** Ray-casting point-in-polygon: ring is array of [lng, lat]. */
function pointInPolygon(px: number, py: number, ring: [number, number][]): boolean {
  let inside = false
  const n = ring.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside
  }
  return inside
}

/** Return state name (from GeoJSON properties.name) that contains [lng, lat], or null. */
function getStateAtCoordinate(
  lng: number,
  lat: number,
  fc: GeoJSON.FeatureCollection<GeoJSON.Polygon> | null
): string | null {
  if (!fc?.features?.length) return null
  for (const f of fc.features) {
    const geom = f.geometry
    if (geom?.type === 'Polygon' && geom.coordinates?.[0]?.length) {
      const ring = geom.coordinates[0] as [number, number][]
      if (pointInPolygon(lng, lat, ring)) {
        const name = (f.properties as { name?: string })?.name
        return name ?? null
      }
    }
  }
  return null
}

/** Sudan bounding box [[sw lng, sw lat], [ne lng, ne lat]] with small margin */
const SUDAN_BOUNDS: [[number, number], [number, number]] = [[21.5, 8.5], [39, 23]]

/** Fits map to full Sudan once when loaded */
function SudanFitBounds() {
  const { map, isLoaded } = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (!map || !isLoaded || fitted.current) return
    fitted.current = true
    map.fitBounds(SUDAN_BOUNDS, { padding: 48, maxZoom: 6 })
  }, [map, isLoaded])
  return null
}

function StoriesContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { can } = useAllowedFunctions()
  const canViewPage = can('learnings_view_page')

  const mode = (searchParams.get('mode') === 'theme' ? 'theme' : 'state') as Mode
  const stateParam = searchParams.get('state')?.trim() || null
  const themeParams = useMemo(
    () => searchParams.getAll('theme').map((t) => t?.trim()).filter(Boolean),
    [searchParams]
  )

  const [options, setOptions] = useState<{
    states: StateOption[]
    themes: ThemeOption[]
  } | null>(null)
  const [summary, setSummary] = useState<StoriesSummary | null>(null)
  const [cards, setCards] = useState<StoryCard[]>([])
  /** Cards with snippets translated AR→EN when locale is EN; otherwise same as cards */
  const [displayCards, setDisplayCards] = useState<StoryCard[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  /** Start true so we show "Loading stories…" on first paint when hasSelection; effect clears when fetch runs or bails */
  const [loadingCards, setLoadingCards] = useState(true)
  const [projectsGeoJson, setProjectsGeoJson] = useState<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null)
  const [statesGeoJson, setStatesGeoJson] = useState<GeoJSON.FeatureCollection<GeoJSON.Polygon> | null>(null)
  type MapPointProperties = {
    project_id: string
    project_name: string | null
    state: string | null
    locality?: string | null
    primary_category?: string
    total_usd?: number
  }
  const [selectedClusterPoint, setSelectedClusterPoint] = useState<{
    coordinates: [number, number]
    properties: MapPointProperties
  } | null>(null)
  const [clusterPopup, setClusterPopup] = useState<{
    coordinates: [number, number]
    features: Array<GeoJSON.Feature<GeoJSON.Point, MapPointProperties>>
  } | null>(null)
  const [baseMapStyle, setBaseMapStyle] = useState<BaseMapStyleKey>('carto')
  const [highlightedCard, setHighlightedCard] = useState<StoryCard | null>(null)
  const [highlightedDetail, setHighlightedDetail] = useState<ProjectDetailData | null>(null)
  /** When locale is EN and report is AR, we translate and show this; otherwise same as highlightedDetail */
  const [displayDetail, setDisplayDetail] = useState<ProjectDetailData | null>(null)
  const [loadingHighlighted, setLoadingHighlighted] = useState(false)
  const { i18n } = useTranslation()
  const [highlightedStoryExpanded, setHighlightedStoryExpanded] = useState(true)
  const [pendingHighlightProjectId, setPendingHighlightProjectId] = useState<string | null>(null)
  const carouselRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)

  // Fetch full story detail when highlighted card changes (server picks EN vs _en by report language when locale=en)
  const isEnLocale = i18n.language === 'en' || i18n.language.startsWith('en-')
  useEffect(() => {
    if (!highlightedCard?.project_id) {
      setHighlightedDetail(null)
      setDisplayDetail(null)
      return
    }
    let cancelled = false
    setLoadingHighlighted(true)
    setHighlightedDetail(null)
    const localeQ = isEnLocale ? '?locale=en' : ''
    fetch(`/api/overview/project/${highlightedCard.project_id}${localeQ}`)
      .then((res) => {
        if (cancelled) return res
        if (res.status === 404) return null
        return res.json()
      })
      .then((json) => {
        if (cancelled) return
        if (json == null || json.is_historical) {
          setHighlightedDetail(null)
          return
        }
        const payload = {
          project: json.project ?? {},
          f5Reports: json.f5Reports ?? [],
          is_historical: false,
        }
        setHighlightedDetail(payload)
        setDisplayDetail(payload)
      })
      .catch(() => {
        if (!cancelled) {
          setHighlightedDetail(null)
          setDisplayDetail(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingHighlighted(false)
      })
    return () => {
      cancelled = true
    }
  }, [highlightedCard?.project_id, isEnLocale])

  // When cards load or change: honor pending highlight (map/cluster click), else keep or random
  useEffect(() => {
    if (cards.length === 0) {
      setHighlightedCard(null)
      setPendingHighlightProjectId(null)
      return
    }
    if (pendingHighlightProjectId) {
      const card = cards.find((c) => c.project_id === pendingHighlightProjectId)
      if (card) {
        setHighlightedCard(card)
        setHighlightedStoryExpanded(true)
      } else {
        setHighlightedCard(cards[Math.floor(Math.random() * cards.length)])
      }
      setPendingHighlightProjectId(null)
      return
    }
    setHighlightedCard((prev) =>
      prev && cards.some((c) => c.project_id === prev.project_id)
        ? prev
        : cards[Math.floor(Math.random() * cards.length)]
    )
  }, [cards])

  const CAROUSEL_CARD_WIDTH = 280
  const CAROUSEL_GAP = 16
  const carouselScroll = (direction: 'left' | 'right') => {
    const el = carouselRef.current
    if (!el) return
    const step = CAROUSEL_CARD_WIDTH + CAROUSEL_GAP
    el.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    })
  }

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
      return
    }
    let cancelled = false
    setLoadingOptions(true)
    fetch('/api/stories/options')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        setOptions({
          states: data.states ?? [],
          themes: data.themes ?? [],
        })
      })
      .catch(() => {
        if (!cancelled) setOptions({ states: [], themes: [] })
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => {
      cancelled = true
    }
  }, [canViewPage, router])

  // Fix invalid state/theme in URL only; no state = Total Sudan (default view)
  useEffect(() => {
    if (loadingOptions || !options) return
    const hasState = stateParam && options.states.some((s) => s.state === stateParam)
    if (mode === 'state' && stateParam && !hasState && options.states.length > 0) {
      router.replace(`/err-portal/stories?mode=state&state=${encodeURIComponent(options.states[0].state)}`)
      return
    }
    const validThemes = themeParams.filter((id) => options.themes.some((t) => t.id === id))
    if (themeParams.length !== validThemes.length) {
      const p = new URLSearchParams()
      p.set('mode', mode)
      if (stateParam) p.set('state', stateParam)
      validThemes.forEach((id) => p.append('theme', id))
      router.replace(`/err-portal/stories?${p.toString()}`)
    }
  }, [loadingOptions, options, mode, stateParam, themeParams, router])

  const fetchCards = useCallback(() => {
    if (mode !== 'state' && themeParams.length === 0) {
      setCards([])
      setSummary(null)
      setDisplayCards([])
      setLoadingCards(false)
      return undefined
    }
    setLoadingCards(true)
    setSummary(null)
    const p = new URLSearchParams()
    if (stateParam) p.set('state', stateParam)
    themeParams.forEach((id) => p.append('theme', id))
    if (isEnLocale) p.set('locale', 'en')
    const query = p.toString()
    const controller = new AbortController()
    let aborted = false
    fetch(`/api/stories/cards${query ? `?${query}` : ''}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const cardList = data?.cards ?? (Array.isArray(data) ? data : [])
        setCards(cardList)
        setDisplayCards(cardList)
        setSummary(data?.summary ?? null)
      })
      .catch((err) => {
        if (err?.name === 'AbortError') {
          aborted = true
          return
        }
        setCards([])
        setDisplayCards([])
        setSummary(null)
      })
      .finally(() => {
        if (aborted) return
        setTimeout(() => setLoadingCards(false), 0)
      })
    return controller
  }, [stateParam, themeParams, mode, isEnLocale])

  useEffect(() => {
    const controller = fetchCards()
    return () => {
      controller?.abort()
    }
  }, [fetchCards])

  useEffect(() => {
    fetch('/api/stories/geojson')
      .then((res) => res.json())
      .then((data) => {
        if (data?.type === 'FeatureCollection' && Array.isArray(data?.features)) {
          setProjectsGeoJson(data as GeoJSON.FeatureCollection<GeoJSON.Point>)
        } else {
          setProjectsGeoJson({ type: 'FeatureCollection', features: [] })
        }
      })
      .catch(() => setProjectsGeoJson({ type: 'FeatureCollection', features: [] }))
  }, [])

  useEffect(() => {
    fetch('/geo/sudan-states.json')
      .then((res) => res.json())
      .then((data) => {
        if (data?.type === 'FeatureCollection' && Array.isArray(data?.features)) {
          setStatesGeoJson(data as GeoJSON.FeatureCollection<GeoJSON.Polygon>)
        }
      })
      .catch(() => {})
  }, [])

  const setMode = (m: Mode) => {
    if (m === 'state') {
      router.replace('/err-portal/stories?mode=state')
      return
    }
    if (m === 'theme' && (options?.themes.length ?? 0) > 0) {
      router.replace(
        `/err-portal/stories?mode=theme&theme=${encodeURIComponent(options!.themes[0].id)}`
      )
      return
    }
    router.replace(`/err-portal/stories?mode=${m}`)
  }

  const selectState = (state: string) => {
    const p = new URLSearchParams()
    p.set('mode', 'state')
    p.set('state', state)
    themeParams.forEach((id) => p.append('theme', id))
    router.replace(`/err-portal/stories?${p.toString()}`)
  }

  const setThemeFilter = (themeIds: string[]) => {
    const p = new URLSearchParams()
    p.set('mode', 'state')
    if (stateParam) p.set('state', stateParam)
    themeIds.forEach((id) => p.append('theme', id))
    router.replace(`/err-portal/stories?${p.toString()}`)
  }

  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false)
  const themeDropdownRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!themeDropdownOpen) return
    const handle = (e: MouseEvent) => {
      if (themeDropdownRef.current?.contains(e.target as Node)) return
      setThemeDropdownOpen(false)
    }
    document.addEventListener('click', handle)
    return () => document.removeEventListener('click', handle)
  }, [themeDropdownOpen])

  const hasSelection = mode === 'state' || themeParams.length > 0
  const fromQuery =
    (stateParam && `fromState=${encodeURIComponent(stateParam)}`) ||
    (themeParams.length > 0 && `fromTheme=${encodeURIComponent(themeParams[0]!)}`) ||
    ''

  const mapGeoJson = useMemo(() => {
    if (!projectsGeoJson?.features?.length) return projectsGeoJson
    if (cards.length === 0) return projectsGeoJson
    const ids = new Set(cards.map((c) => c.project_id))
    return {
      ...projectsGeoJson,
      features: projectsGeoJson.features.filter((f) =>
        ids.has((f.properties as MapPointProperties)?.project_id ?? '')
      ),
    }
  }, [projectsGeoJson, cards])

  const { timelinePoints, categoryColorIndex, timelineYMax } = useMemo(() => {
    const indexByCategory = new Map<string, number>()
    const withDate = cards.filter(
      (c) => c.report_date != null && c.report_date !== ''
    )
    const byDate = new Map<number, StoryCard[]>()
    for (const c of withDate) {
      const date = new Date(c.report_date!)
      const ts = Number.isNaN(date.getTime()) ? 0 : date.getTime()
      if (!byDate.has(ts)) byDate.set(ts, [])
      byDate.get(ts)!.push(c)
    }
    const points: Array<{
      x: number
      y: number
      project_id: string
      primary_category: string
      name: string
      report_date: string
      locality: string
    }> = []
    for (const [ts, list] of [...byDate.entries()].sort((a, b) => a[0] - b[0])) {
      list.forEach((c, i) => {
        const primary_category =
          c.primary_category ?? c.theme_labels?.[0] ?? 'Other'
        getCategoryColor(primary_category, indexByCategory)
        points.push({
          x: ts,
          y: i,
          project_id: c.project_id,
          primary_category,
          name: c.project_name || 'Unnamed project',
          report_date: formatDate(c.report_date),
          locality: [c.state, c.locality].filter(Boolean).join(' · ') || '—',
        })
      })
    }
    const maxStack =
      byDate.size > 0
        ? Math.max(...[...byDate.values()].map((arr) => arr.length)) - 1
        : 0
    return {
      timelinePoints: points,
      categoryColorIndex: indexByCategory,
      timelineYMax: Math.max(0, maxStack),
    }
  }, [cards])

  const handlePrintPdf = useCallback(async () => {
    const el = printRef.current
    if (!el) return
    setGeneratingPdf(true)
    setHighlightedStoryExpanded(true)
    try {
      await new Promise((r) => setTimeout(r, 1200))
      if (carouselRef.current) carouselRef.current.scrollLeft = 0
      await new Promise((r) => setTimeout(r, 200))
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('iframe').forEach((iframe) => iframe.remove())
      clone.querySelectorAll('style').forEach((s) => s.remove())
      clone.querySelectorAll('link').forEach((s) => s.remove())
      stripAllStyleAttributes(clone)
      copyComputedStylesForPdf(el, clone)
      sanitizeOklabInClone(clone)
      const mapPlaceholder = clone.querySelector('[data-pdf-map-placeholder]') as HTMLElement | null
      if (mapPlaceholder) {
        const mapLabel = mode === 'state' && stateParam ? stateParam : 'Total Sudan'
        mapPlaceholder.innerHTML = ''
        const placeholderDiv = document.createElement('div')
        placeholderDiv.setAttribute('style', 'display:flex;align-items:center;justify-content:center;height:100%;width:100%;background:#f1f5f9;color:#64748b;font-size:1rem;border-radius:0.375rem;')
        placeholderDiv.textContent = `Map: ${mapLabel}`
        mapPlaceholder.appendChild(placeholderDiv)
      }
      const highlightContent = clone.querySelector('[data-pdf-highlight-content]') as HTMLElement | null
      if (highlightContent) {
        highlightContent.setAttribute('style', (highlightContent.getAttribute('style') || '') + ';max-height:none;overflow:visible;')
      }
      const wrapper = document.createElement('div')
      wrapper.style.position = 'fixed'
      wrapper.style.left = '-99999px'
      wrapper.style.top = '0'
      wrapper.style.width = `${el.scrollWidth}px`
      wrapper.style.height = `${el.scrollHeight}px`
      wrapper.style.overflow = 'auto'
      wrapper.style.backgroundColor = '#ffffff'
      wrapper.appendChild(clone)
      document.body.appendChild(wrapper)
      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      })
      document.body.removeChild(wrapper)
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const margin = 10
      const contentW = pageW - 2 * margin
      const contentH = pageH - 2 * margin
      const imgW = canvas.width
      const imgH = canvas.height
      const ratio = contentW / imgW
      const scaledH = imgH * ratio
      const totalPages = Math.ceil(scaledH / contentH) || 1
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage()
        const srcY = (page * contentH / ratio)
        const srcH = Math.min(contentH / ratio, imgH - srcY)
        const sliceCanvas = document.createElement('canvas')
        sliceCanvas.width = imgW
        sliceCanvas.height = srcH
        const ctx = sliceCanvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, imgW, srcH)
          ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH)
        }
        const sliceData = sliceCanvas.toDataURL('image/png')
        const drawH = Math.min(srcH * ratio, contentH)
        pdf.addImage(sliceData, 'PNG', margin, margin, contentW, drawH)
      }
      pdf.save('mutual-aid-learnings.pdf')
    } catch (e) {
      console.error('PDF generation failed', e)
    } finally {
      setGeneratingPdf(false)
    }
  }, [])

  if (!canViewPage) return null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
          <Link
            href="/err-portal"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
          onClick={handlePrintPdf}
          disabled={generatingPdf}
        >
          <FileDown className="h-4 w-4" />
          {generatingPdf ? 'Generating…' : 'Print / Save as PDF'}
        </Button>
      </div>
      <div ref={printRef} className="print-area bg-background rounded-lg">
      <h1 className="text-3xl font-bold mb-6 text-accent-foreground">Mutual Aid Learnings</h1>

      <div className="flex flex-col gap-6">
        {/* Row 1: map + narrative (or placeholders) */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Map: half width on large screens */}
          <aside className="lg:w-1/2 shrink-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Use the controls on the map to view Total Sudan or filter by theme. Click a cluster or point to see stories for that state. Narrative, timeline, and story cards update below.
          </p>
          <div className="relative h-[420px] w-full rounded-lg border overflow-hidden" data-pdf-map-placeholder>
            <MapView
              center={[30, 14]}
              zoom={5}
              fadeDuration={0}
              styles={BASE_MAP_STYLES[baseMapStyle]}
            >
              <SudanFitBounds />
              {mapGeoJson && (
                <MapClusterLayer<MapPointProperties>
                  data={mapGeoJson as GeoJSON.FeatureCollection<GeoJSON.Point, MapPointProperties>}
                  clusterRadius={50}
                  clusterMaxZoom={14}
                  clusterZoomMax={9}
                  clusterColors={['#1d8cf8', '#6d5dfc', '#e23670']}
                  pointColor="#1d8cf8"
                  onClusterClick={(_, coordinates) => {
                    setSelectedClusterPoint(null)
                    setClusterPopup(null)
                    const [lng, lat] = coordinates
                    const stateName = getStateAtCoordinate(lng, lat, statesGeoJson)
                    if (!stateName) return
                    const resolved =
                      options?.states?.some((s) => s.state === stateName)
                        ? stateName
                        : stateName === 'Al Jazirah'
                          ? 'Gezira'
                          : stateName
                    selectState(resolved)
                  }}
                  onClusterClickWithLeaves={(coordinates, _pointCount, features) => {
                    setSelectedClusterPoint(null)
                    setClusterPopup({ coordinates, features })
                  }}
                  onPointClick={(feature, coordinates) => {
                    setClusterPopup(null)
                    const props = feature.properties
                    if (props) {
                      const projectId = props.project_id ?? ''
                      setSelectedClusterPoint({
                        coordinates,
                        properties: {
                          project_id: projectId,
                          project_name: props.project_name ?? null,
                          state: props.state ?? null,
                          locality: props.locality ?? null,
                          primary_category: props.primary_category,
                          total_usd: props.total_usd,
                        },
                      })
                      setPendingHighlightProjectId(projectId)
                      if (props.state) {
                        const resolved =
                          options?.states?.some((s) => s.state === props.state)
                            ? props.state
                            : props.state === 'Al Jazirah'
                              ? 'Gezira'
                              : props.state
                        selectState(resolved)
                      }
                    }
                  }}
                />
              )}
              {selectedClusterPoint && (
                <MapPopup
                  key={`point-${selectedClusterPoint.coordinates[0]}-${selectedClusterPoint.coordinates[1]}`}
                  longitude={selectedClusterPoint.coordinates[0]}
                  latitude={selectedClusterPoint.coordinates[1]}
                  onClose={() => setSelectedClusterPoint(null)}
                  closeOnClick={false}
                  focusAfterOpen={false}
                  closeButton
                  className="!p-2 !bg-gray-900/90 !text-gray-100 !border-gray-600/50 shadow-lg backdrop-blur-sm"
                >
                  <div className="space-y-1 px-0.5 py-0 min-w-[160px]">
                    <p className="text-sm font-medium text-gray-100">
                      {selectedClusterPoint.properties.locality?.trim() || selectedClusterPoint.properties.project_name || 'Project'}
                    </p>
                    {selectedClusterPoint.properties.state && (
                      <p className="text-xs text-gray-300">{selectedClusterPoint.properties.state}</p>
                    )}
                    {(selectedClusterPoint.properties.primary_category || (selectedClusterPoint.properties.total_usd != null && selectedClusterPoint.properties.total_usd > 0)) && (
                      <p className="text-xs text-gray-400">
                        {[selectedClusterPoint.properties.primary_category, selectedClusterPoint.properties.total_usd != null && selectedClusterPoint.properties.total_usd > 0
                          ? `$${selectedClusterPoint.properties.total_usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                          : null].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const id = selectedClusterPoint.properties.project_id
                        const card = cards.find((c) => c.project_id === id)
                        if (card) {
                          setHighlightedCard(card)
                          setHighlightedStoryExpanded(true)
                        } else {
                          setPendingHighlightProjectId(id)
                          setHighlightedStoryExpanded(true)
                        }
                      }}
                      className="text-xs text-amber-200 hover:text-amber-100 hover:underline"
                    >
                      View story →
                    </button>
                  </div>
                </MapPopup>
              )}
              {clusterPopup && (
                <MapPopup
                  key={`cluster-${clusterPopup.coordinates[0]}-${clusterPopup.coordinates[1]}`}
                  longitude={clusterPopup.coordinates[0]}
                  latitude={clusterPopup.coordinates[1]}
                  onClose={() => setClusterPopup(null)}
                  closeOnClick={false}
                  focusAfterOpen={false}
                  closeButton
                  className="!p-2 !bg-gray-900/90 !text-gray-100 !border-gray-600/50 shadow-lg backdrop-blur-sm"
                >
                  <div className="space-y-1.5 px-0.5 py-0 min-w-[140px] max-h-[200px] overflow-y-auto">
                    <p className="text-xs font-medium text-gray-300">
                      {clusterPopup.features.length} project{clusterPopup.features.length !== 1 ? 's' : ''} in this cluster
                    </p>
                    <ul className="space-y-0.5">
                      {clusterPopup.features.map((f) => {
                        const id = f.properties?.project_id ?? ''
                        const locality = f.properties?.locality?.trim() || f.properties?.project_name || 'Project'
                        const category = f.properties?.primary_category
                        const usd = f.properties?.total_usd
                        const parts = [locality]
                        if (category) parts.push(category)
                        if (usd != null && usd > 0)
                          parts.push(`$${usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`)
                        return (
                          <li key={id} className="text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                const card = cards.find((c) => c.project_id === id)
                                if (card) {
                                  setHighlightedCard(card)
                                  setHighlightedStoryExpanded(true)
                                } else {
                                  setPendingHighlightProjectId(id)
                                  setHighlightedStoryExpanded(true)
                                }
                              }}
                              className="text-amber-200 hover:text-amber-100 hover:underline block w-full text-left"
                            >
                              {parts.join(' · ')} →
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </MapPopup>
              )}
              <MapControls />
            </MapView>
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5 items-end">
              {mode === 'state' && (
                <button
                  type="button"
                  onClick={() => {
                    const p = new URLSearchParams()
                    p.set('mode', 'state')
                    themeParams.forEach((id) => p.append('theme', id))
                    router.replace(`/err-portal/stories?${p.toString()}`)
                  }}
                  className={`flex h-7 w-[140px] items-center justify-center rounded-md border border-gray-600/50 bg-gray-900/90 px-2 text-xs text-gray-100 shadow-lg hover:bg-gray-800/90 ${!stateParam ? 'font-medium' : ''}`}
                >
                  Total Sudan
                </button>
              )}
              <div className="relative" ref={themeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setThemeDropdownOpen((o) => !o)}
                  className="flex h-7 w-[140px] items-center justify-between gap-1 rounded-md border border-gray-600/50 bg-gray-900/90 px-2 py-1 text-xs text-gray-100 shadow-lg hover:bg-gray-800/90"
                >
                  <span className="truncate">
                    {themeParams.length === 0
                      ? 'Themes: All'
                      : themeParams.length === 1
                        ? `Themes: ${options?.themes.find((t) => t.id === themeParams[0])?.label ?? themeParams[0]}`
                        : `Themes: ${themeParams.length} selected`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </button>
                {themeDropdownOpen && (options?.themes.length ?? 0) > 0 && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-[140px] rounded-md border border-gray-600/50 bg-gray-900/95 p-1.5 shadow-lg">
                    <div className="max-h-[200px] space-y-0.5 overflow-y-auto">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs text-gray-100 hover:bg-white/10 border-b border-gray-600/50 mb-0.5">
                        <Checkbox
                          checked={themeParams.length === options!.themes.length}
                          onCheckedChange={(checked) => {
                            setThemeFilter(checked ? options!.themes.map((t) => t.id) : [])
                          }}
                          className="border-gray-400 data-[state=checked]:bg-gray-100 data-[state=checked]:text-gray-900"
                        />
                        <span className="truncate font-medium">Select all</span>
                      </label>
                      {options!.themes.map((t) => (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs text-gray-100 hover:bg-white/10"
                        >
                          <Checkbox
                            checked={themeParams.includes(t.id)}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [...themeParams, t.id]
                                : themeParams.filter((id) => id !== t.id)
                              setThemeFilter(next)
                            }}
                            className="border-gray-400 data-[state=checked]:bg-gray-100 data-[state=checked]:text-gray-900"
                          />
                          <span className="truncate">
                            {t.label} ({t.project_count})
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="absolute top-2 left-2 z-10">
              <Select value={baseMapStyle} onValueChange={(v) => setBaseMapStyle(v as BaseMapStyleKey)}>
                <SelectTrigger className="h-7 w-[140px] text-xs bg-gray-900/90 text-gray-100 border-gray-600/50 shadow-lg hover:bg-gray-800/90 [&>svg]:text-gray-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-gray-600/50 bg-gray-900/95 text-gray-100">
                  <SelectItem value="carto" className="text-xs focus:bg-white/10 focus:text-gray-100">Carto</SelectItem>
                  <SelectItem value="openstreetmap" className="text-xs focus:bg-white/10 focus:text-gray-100">OpenStreetMap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </aside>

        {/* Main: narrative card or placeholders only (row 1) */}
        <main className="flex-1 min-w-0">
          {!hasSelection ? (
            <p className="text-muted-foreground">
              Use the controls on the map to filter by theme, or click a cluster or point to see stories for that state.
            </p>
          ) : loadingCards ? (
            <p className="text-muted-foreground">Loading stories…</p>
          ) : cards.length === 0 ? (
            <p className="text-muted-foreground">No stories for this selection.</p>
          ) : (
            <div className="space-y-6">
              {summary && summary.total_projects > 0 && (
                <Card className="bg-muted/50 min-h-[520px] flex flex-col">
                  <CardContent className="pt-6 text-accent-foreground flex-1 min-h-0 overflow-y-auto">
                    <p className="text-base leading-relaxed">
                      {(mode === 'state' && !stateParam) || (mode === 'theme' && themeParams.length > 0) ? (
                        <>
                          Across <strong>Sudan</strong>,{' '}
                          <strong>{summary.total_projects}</strong> project
                          {summary.total_projects !== 1 ? 's are' : ' is'} sharing stories of support
                          {summary.total_beneficiaries > 0 && (
                            <>
                              —reaching an estimated{' '}
                              <strong>
                                {summary.total_beneficiaries.toLocaleString()}
                              </strong>{' '}
                              people
                            </>
                          )}
                          {summary.total_households > 0 && (
                            <>
                              {' '}
                              across{' '}
                              <strong>
                                {summary.total_households.toLocaleString()}
                              </strong>{' '}
                              households
                            </>
                          )}
                          {summary.locality_count > 0 && (
                            <>
                              {' '}
                              in{' '}
                              <strong>{summary.locality_count}</strong> localit
                              {summary.locality_count !== 1 ? 'ies' : 'y'}
                              {summary.localities.length > 0 && (
                                <> ({summary.localities.slice(0, 8).join(', ')}
                                  {summary.localities.length > 8 ? '…' : ''})</>
                              )}
                            </>
                          )}
                          {(summary.total_usd ?? 0) > 0 && (
                            <>
                              {' '}
                              with{' '}
                              <strong>
                                ${summary.total_usd!.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </strong>{' '}
                              in project value
                            </>
                          )}
                          {(summary.top_categories?.length ?? 0) > 0 ? '.' : '.'}
                        </>
                      ) : mode === 'state' && stateParam ? (
                        <>
                          In <strong>{stateParam}</strong>,{' '}
                          <strong>{summary.total_projects}</strong> project
                          {summary.total_projects !== 1 ? 's are' : ' is'} sharing stories of support
                          {summary.total_beneficiaries > 0 && (
                            <>
                              —reaching an estimated{' '}
                              <strong>
                                {summary.total_beneficiaries.toLocaleString()}
                              </strong>{' '}
                              people
                            </>
                          )}
                          {summary.total_households > 0 && (
                            <>
                              {' '}
                              across{' '}
                              <strong>
                                {summary.total_households.toLocaleString()}
                              </strong>{' '}
                              households
                            </>
                          )}
                          {summary.locality_count > 0 && (
                            <>
                              {' '}
                              in{' '}
                              <strong>{summary.locality_count}</strong> localit
                              {summary.locality_count !== 1 ? 'ies' : 'y'}
                              {summary.localities.length > 0 &&
                                summary.localities.length <= 5 && (
                                  <> ({summary.localities.join(', ')})</>
                                )}
                            </>
                          )}
                          {(summary.total_usd ?? 0) > 0 && (
                            <>
                              {' '}
                              with{' '}
                              <strong>
                                ${summary.total_usd!.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </strong>{' '}
                              in project value
                            </>
                          )}
                          {(summary.top_categories?.length ?? 0) > 0 ? '.' : '.'}
                        </>
                      ) : null}
                      {themeParams.length > 0 && options?.themes && (
                        <>
                          {' '}
                          Filtered by:{' '}
                          {themeParams
                            .map((id) => options!.themes.find((t) => t.id === id)?.label ?? id)
                            .filter(Boolean)
                            .join(', ')}
                          .
                        </>
                      )}
                    </p>
                    {summary && (summary.top_categories?.length ?? 0) > 0 && (
                      <>
                        <p className="text-base font-medium mt-4 mb-2 text-accent-foreground">Where support went:</p>
                        <ul className="list-none space-y-1.5 text-base text-accent-foreground">
                          {summary.top_categories!.map((tc, i) => {
                            const Icon = getSectorIcon(tc.category)
                            const label =
                              tc.category === 'Other' && (tc.other_subcategories?.length ?? 0) > 0
                                ? `Other (e.g. ${tc.other_subcategories!.slice(0, 4).join(', ')})`
                                : tc.category
                            return (
                              <li key={tc.category + String(i)} className="flex items-center gap-2">
                                <Icon className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
                                <span>
                                  <strong>{label}</strong>{' '}
                                  (${tc.total_usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })})
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                        {(() => {
                          const diversity = getSpendDiversityFromCategories(summary.top_categories!, summary.total_usd)
                          return diversity != null ? (
                            <p className="text-base text-muted-foreground mt-3">
                              <strong className="text-accent-foreground">Spend diversity: {(diversity * 100).toFixed(0)}%.</strong>{' '}
                              {spendDiversityInWords(diversity)}{' '}
                              (0% means all spend in one sector; 100% means perfectly even spread.)
                            </p>
                          ) : null
                        })()}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
        </div>

        {/* Row 2: timeline + card carousel */}
        {hasSelection && !loadingCards && cards.length > 0 && (
          <div className="w-full space-y-6">
            {/* Timeline: projects as dots by report date, colored by sector; same date = stacked */}
            <div className="rounded-none border-0 bg-card shadow-md p-4">
              <h2 className="text-xl font-semibold text-accent-foreground text-center mb-4">
                Project Timeline
              </h2>
              {timelinePoints.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No projects with report dates to show on the timeline.
                </p>
              ) : (
                <>
                  <div className="h-[120px] min-h-[120px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height={120} minHeight={120}>
                      <ScatterChart
                        margin={{ top: 8, right: 16, bottom: 24, left: 16 }}
                      >
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(ts) => {
                            const d = new Date(ts)
                            return d.toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          }}
                          name="Report date"
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          domain={[-0.5, timelineYMax + 0.5]}
                          hide
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]?.payload) return null
                            const p = payload[0].payload as {
                              name: string
                              report_date: string
                              primary_category: string
                              locality: string
                            }
                            return (
                              <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
                                <div className="font-medium">{p.name}</div>
                                <div className="text-muted-foreground">{p.locality}</div>
                                <div>Report: {p.report_date}</div>
                                <div className="text-muted-foreground">{p.primary_category}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Click to read full story
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Scatter
                          data={timelinePoints}
                          name="Projects"
                          shape={(props: {
                            cx?: number
                            cy?: number
                            payload?: { primary_category?: string }
                          }) => {
                            const cx = props.cx ?? 0
                            const cy = props.cy ?? 0
                            const fill = props.payload
                              ? getCategoryColor(
                                  props.payload.primary_category ?? 'Other',
                                  categoryColorIndex
                                )
                              : CATEGORY_COLORS[0]
                            return (
                              <circle
                                r={8}
                                cx={cx}
                                cy={cy}
                                fill={fill}
                                stroke="rgba(0,0,0,0.12)"
                                strokeWidth={1}
                              />
                            )
                          }}
                          isAnimationActive={true}
                          cursor="pointer"
                          onClick={(e: { payload?: { project_id?: string } }) => {
                            const id = e?.payload?.project_id
                            if (!id) return
                            const card = cards.find((c) => c.project_id === id)
                            if (card) {
                              setHighlightedCard(card)
                              setHighlightedStoryExpanded(true)
                            }
                          }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
                    {[...categoryColorIndex.entries()]
                      .sort((a, b) => a[1] - b[1])
                      .map(([cat, idx]) => (
                        <span key={cat} className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor:
                                CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                            }}
                          />
                          {cat}
                        </span>
                      ))}
                  </div>
                </>
              )}
            </div>

            {/* Card carousel: Rolodex style — 3 cards visible, roll left/right */}
            <div>
              <h2 className="text-xl font-semibold text-accent-foreground text-center mb-4">
                Project Learnings
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  onClick={() => carouselScroll('left')}
                  aria-label="Previous cards"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div
                  className="overflow-hidden min-w-0 flex-1"
                  style={{
                    maxWidth: CAROUSEL_CARD_WIDTH * 3 + CAROUSEL_GAP * 2,
                  }}
                >
                  <div
                    ref={carouselRef}
                    className="flex gap-4 overflow-x-auto overflow-y-hidden pb-2 scroll-smooth snap-x snap-mandatory sidebar-nav-scroll"
                  >
                    {(displayCards.length === cards.length ? displayCards : cards).map((c) => (
                      <Card
                        key={c.project_id}
                        role="button"
                        tabIndex={0}
                        className={`flex flex-col shrink-0 snap-center rounded-none border-0 shadow-md cursor-pointer transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          highlightedCard?.project_id === c.project_id
                            ? 'ring-2 ring-accent-foreground shadow-lg'
                            : ''
                        }`}
                        style={{ width: CAROUSEL_CARD_WIDTH }}
                        onClick={() => {
                          setHighlightedCard(c)
                          setHighlightedStoryExpanded(true)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setHighlightedCard(c)
                            setHighlightedStoryExpanded(true)
                          }
                        }}
                      >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">
                          {c.project_name || 'Unnamed project'}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {[c.state, c.locality]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                        {c.theme_labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.theme_labels.slice(0, 3).map((l) => (
                              <span
                                key={l}
                                className="text-xs px-2 py-0.5 rounded bg-muted"
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="flex-1">
                        {c.positive_changes_snippet ? (
                          <p className="text-sm line-clamp-3">
                            {c.positive_changes_snippet}
                          </p>
                        ) : c.objectives_snippet ? (
                          <p className="text-sm line-clamp-3">
                            {c.objectives_snippet}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No narrative yet.
                          </p>
                        )}
                        {c.beneficiaries_count != null && (
                          <p className="text-sm text-muted-foreground mt-2">
                            ~{c.beneficiaries_count.toLocaleString()} beneficiaries
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="text-xs text-muted-foreground">
                        Full story shown below when selected
                      </CardFooter>
                    </Card>
                  ))}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-10 w-10"
                  onClick={() => carouselScroll('right')}
                  aria-label="Next cards"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {/* Highlight Learning: full story content; collapsed = title + At a glance + chevron; expanded = full content */}
              {highlightedCard && (
                <div className="mt-6 rounded-none border-0 bg-card shadow-md overflow-hidden">
                  <h2 className="text-xl font-semibold text-accent-foreground text-center py-4 border-b">
                    Highlight Learning
                  </h2>
                  {/* When collapsed: show At a glance only. When expanded: show full content. */}
                  <div className={`text-accent-foreground ${highlightedStoryExpanded ? 'p-6 max-h-[70vh] overflow-y-auto' : 'p-4'}`} data-pdf-highlight-content>
                    {loadingHighlighted ? (
                      <p className="text-muted-foreground py-4 text-center text-sm">
                        Loading…
                      </p>
                    ) : (displayDetail ?? highlightedDetail) ? (
                      <HighlightedStoryContent
                        data={(displayDetail ?? highlightedDetail)!}
                        formatDate={formatDate}
                        showOnlyAtGlance={!highlightedStoryExpanded}
                      />
                    ) : !highlightedStoryExpanded ? null : (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold">
                          {highlightedCard.project_name || 'Unnamed project'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {[highlightedCard.state, highlightedCard.locality]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                        <p className="text-sm text-muted-foreground italic">
                          Story details could not be loaded.
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHighlightedStoryExpanded((e) => !e)}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-accent-foreground hover:bg-muted/50 transition-colors border-t"
                    aria-expanded={highlightedStoryExpanded}
                    aria-label={highlightedStoryExpanded ? 'Collapse highlight learning' : 'Expand highlight learning'}
                  >
                    {highlightedStoryExpanded ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Minimize
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Expand
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

export default function StoriesPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px] text-muted-foreground">Loading…</div>}>
      <StoriesContent />
    </Suspense>
  )
}
