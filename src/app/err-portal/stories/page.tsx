'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Baby,
  BookOpen,
  Brain,
  Briefcase,
  Droplets,
  GraduationCap,
  HandCoins,
  Heart,
  Home,
  LayoutGrid,
  Layers,
  ScatterChart as ScatterChartIcon,
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
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Mode = 'state' | 'theme'

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

function formatDate(d: string | null | undefined): string {
  if (d == null || d === '') return ''
  try {
    const date = new Date(String(d))
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

/** Fixed palette for scatter by primary category (distinct, accessible). */
const CATEGORY_COLORS = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#059669', // emerald
  '#dc2626', // red
  '#d97706', // amber
  '#0891b2', // cyan
  '#7c3aed', // purple
  '#2563eb', // blue
  '#ca8a04', // yellow
  '#4f46e5', // indigo
]

function getCategoryColor(category: string, indexByCategory: Map<string, number>): string {
  let idx = indexByCategory.get(category)
  if (idx == null) {
    idx = indexByCategory.size
    indexByCategory.set(category, idx)
  }
  return CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
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

type ViewMode = 'cards' | 'scatter'

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

export default function StoriesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { can } = useAllowedFunctions()
  const canViewPage = can('f4_f5_view_page')

  const mode = (searchParams.get('mode') === 'theme' ? 'theme' : 'state') as Mode
  const stateParam = searchParams.get('state')?.trim() || null
  const themeParam = searchParams.get('theme')?.trim() || null

  const [options, setOptions] = useState<{
    states: StateOption[]
    themes: ThemeOption[]
  } | null>(null)
  const [summary, setSummary] = useState<StoriesSummary | null>(null)
  const [cards, setCards] = useState<StoryCard[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [loadingCards, setLoadingCards] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('scatter')

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

  // Set default selection when options load and nothing is selected
  useEffect(() => {
    if (loadingOptions || !options) return
    const hasState = stateParam && options.states.some((s) => s.state === stateParam)
    const hasTheme = themeParam && options.themes.some((t) => t.id === themeParam)
    if (mode === 'state' && !hasState && options.states.length > 0) {
      const first = options.states[0].state
      router.replace(`/err-portal/stories?mode=state&state=${encodeURIComponent(first)}`)
      return
    }
    if (mode === 'theme' && themeParam && !hasTheme && options.themes.length > 0) {
      const first = options.themes[0].id
      router.replace(`/err-portal/stories?mode=theme&theme=${encodeURIComponent(first)}`)
    }
  }, [loadingOptions, options, mode, stateParam, themeParam, router])

  const fetchCards = useCallback(() => {
    if (stateParam) {
      setLoadingCards(true)
      setSummary(null)
      fetch(`/api/stories/cards?state=${encodeURIComponent(stateParam)}`)
        .then((res) => res.json())
        .then((data) => {
          const cardList = data?.cards ?? (Array.isArray(data) ? data : [])
          setCards(cardList)
          setSummary(data?.summary ?? null)
        })
        .catch(() => {
          setCards([])
          setSummary(null)
        })
        .finally(() => setLoadingCards(false))
      return
    }
    if (themeParam) {
      setLoadingCards(true)
      setSummary(null)
      fetch(`/api/stories/cards?theme=${encodeURIComponent(themeParam)}`)
        .then((res) => res.json())
        .then((data) => {
          const cardList = data?.cards ?? (Array.isArray(data) ? data : [])
          setCards(cardList)
          setSummary(data?.summary ?? null)
        })
        .catch(() => {
          setCards([])
          setSummary(null)
        })
        .finally(() => setLoadingCards(false))
      return
    }
    setCards([])
    setSummary(null)
  }, [stateParam, themeParam])

  useEffect(() => {
    fetchCards()
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
    if (m === 'state' && (options?.states.length ?? 0) > 0) {
      router.replace(
        `/err-portal/stories?mode=state&state=${encodeURIComponent(options!.states[0].state)}`
      )
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
    router.replace(
      `/err-portal/stories?mode=state&state=${encodeURIComponent(state)}`
    )
  }

  const selectTheme = (themeId: string) => {
    router.replace(
      `/err-portal/stories?mode=theme&theme=${encodeURIComponent(themeId)}`
    )
  }

  const hasSelection = !!stateParam || !!themeParam
  const fromQuery =
    (stateParam && `fromState=${encodeURIComponent(stateParam)}`) ||
    (themeParam && `fromTheme=${encodeURIComponent(themeParam)}`) ||
    ''

  const { scatterPoints, categoryColorIndex } = useMemo(() => {
    const indexByCategory = new Map<string, number>()
    const points = cards
      .filter((c) => c.report_date != null && c.report_date !== '')
      .map((c) => {
        const date = new Date(c.report_date!)
        const ts = Number.isNaN(date.getTime()) ? 0 : date.getTime()
        const spend_diversity = c.spend_diversity ?? 0
        const primary_category = c.primary_category ?? c.theme_labels?.[0] ?? 'Other'
        getCategoryColor(primary_category, indexByCategory)
        return {
          x: ts,
          y: spend_diversity,
          name: c.project_name || 'Unnamed project',
          project_id: c.project_id,
          primary_category,
          report_date: formatDate(c.report_date),
          locality: [c.state, c.locality].filter(Boolean).join(' · ') || '—',
          spend_diversity,
        }
      })
    return { scatterPoints: points, categoryColorIndex: indexByCategory }
  }, [cards])

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
      </div>
      <h1 className="text-3xl font-bold mb-6 text-accent-foreground">Mutual Aid Stories</h1>

      <div className="flex flex-col gap-6">
        {/* Row 1: map + narrative (or placeholders) */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Map: half width on large screens */}
          <aside className="lg:w-1/2 shrink-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Click a cluster or a point to see stories for that state. Narrative, scatter, and cards update below.
          </p>
          <div className="relative h-[420px] w-full rounded-lg border overflow-hidden">
            <MapView
              center={[30, 14]}
              zoom={5}
              fadeDuration={0}
              styles={BASE_MAP_STYLES[baseMapStyle]}
            >
              <SudanFitBounds />
              {projectsGeoJson && (
                <MapClusterLayer<MapPointProperties>
                  data={projectsGeoJson}
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
                      setSelectedClusterPoint({
                        coordinates,
                        properties: {
                          project_id: props.project_id ?? '',
                          project_name: props.project_name ?? null,
                          state: props.state ?? null,
                          locality: props.locality ?? null,
                          primary_category: props.primary_category,
                          total_usd: props.total_usd,
                        },
                      })
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
                    <Link
                      href={`/err-portal/stories/${selectedClusterPoint.properties.project_id}${fromQuery ? `?${fromQuery}` : ''}`}
                      className="text-xs text-amber-200 hover:text-amber-100 hover:underline"
                    >
                      View story →
                    </Link>
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
                            <Link
                              href={`/err-portal/stories/${id}${fromQuery ? `?${fromQuery}` : ''}`}
                              className="text-amber-200 hover:text-amber-100 hover:underline block"
                            >
                              {parts.join(' · ')} →
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </MapPopup>
              )}
              <MapControls />
            </MapView>
            <div className="absolute top-2 left-2 z-10">
              <Select value={baseMapStyle} onValueChange={(v) => setBaseMapStyle(v as BaseMapStyleKey)}>
                <SelectTrigger className="w-[160px] h-8 text-xs bg-background/95 shadow-sm border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="carto">Carto</SelectItem>
                  <SelectItem value="openstreetmap">OpenStreetMap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <button
              type="button"
              onClick={() => router.replace('/err-portal/stories?mode=theme')}
              className="text-primary hover:underline"
            >
              Browse by theme
            </button>
          </p>
        </aside>

        {/* Main: narrative card or placeholders only (row 1) */}
        <main className="flex-1 min-w-0">
          {mode === 'theme' && !themeParam && (options?.themes.length ?? 0) > 0 && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">Select a theme:</p>
              <div className="flex flex-wrap gap-2">
                {options!.themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTheme(t.id)}
                    className="px-3 py-1.5 rounded-md text-sm bg-muted hover:bg-muted/80 transition-colors"
                  >
                    {t.label} ({t.project_count})
                  </button>
                ))}
              </div>
            </div>
          )}
          {!hasSelection ? (
            <p className="text-muted-foreground">
              {mode === 'theme' ? 'Select a theme above to see stories.' : 'Click a point on the map to see stories for that state.'}
            </p>
          ) : loadingCards ? (
            <p className="text-muted-foreground">Loading stories…</p>
          ) : cards.length === 0 ? (
            <p className="text-muted-foreground">No stories for this selection.</p>
          ) : (
            <div className="space-y-6">
              {summary && summary.total_projects > 0 && (
                <Card className="bg-muted/50">
                  <CardContent className="pt-6 text-accent-foreground">
                    <p className="text-base leading-relaxed">
                      {mode === 'state' && stateParam && (
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
                      )}
                      {mode === 'theme' && themeParam && options?.themes.find((t) => t.id === themeParam) && (
                        <>
                          In the{' '}
                          <strong>
                            {options.themes.find((t) => t.id === themeParam)!.label}
                          </strong>{' '}
                          theme, <strong>{summary.total_projects}</strong> project
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
                              across <strong>{summary.locality_count}</strong> localit
                              {summary.locality_count !== 1 ? 'ies' : 'y'}
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
                      </>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </main>
        </div>

        {/* Row 2: full-width scatter and cards (same width as map + narrative) */}
        {hasSelection && !loadingCards && cards.length > 0 && (
          <div className="w-full space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'scatter' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('scatter')}
                className="gap-1.5"
              >
                <ScatterChartIcon className="h-4 w-4" />
                Scatter
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
                className="gap-1.5"
              >
                <LayoutGrid className="h-4 w-4" />
                Cards
              </Button>
            </div>
            {viewMode === 'scatter' ? (
              <div className="rounded-lg border bg-card p-4">
                {scatterPoints.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center text-sm">
                    No projects with report dates to show in the scatter view.
                  </p>
                ) : (
                  <div className="h-[420px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 16 }}>
                        <XAxis
                          type="number"
                          dataKey="x"
                          domain={['dataMin', 'dataMax']}
                          tickFormatter={(ts) => {
                            const d = new Date(ts)
                            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          }}
                          name="Report date"
                          tick={{ fontSize: 11 }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name="Spend diversity"
                          allowDecimals={true}
                          axisLine={false}
                          tick={{ fontSize: 11 }}
                          domain={[0, 0.4]}
                          tickCount={5}
                          tickFormatter={(v) => {
                            const n = Number(v)
                            if (n <= 0.05) return 'Focused'
                            if (n <= 0.15) return 'Mostly focused'
                            if (n <= 0.25) return 'Mixed'
                            if (n <= 0.35) return 'Spread out'
                            return 'Very spread out'
                          }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: '3 3' }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]?.payload) return null
                            const p = payload[0].payload as {
                              name: string
                              report_date: string
                              y: number
                              spend_diversity: number
                              primary_category: string
                              locality: string
                            }
                            const d = p.spend_diversity ?? p.y
                            const diversityLabel =
                              d <= 0.2 ? 'focused' : d >= 0.7 ? 'spread out' : 'mixed'
                            return (
                              <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-sm">
                                <div className="font-medium">{p.name}</div>
                                <div className="text-muted-foreground">{p.locality}</div>
                                <div>
                                  Report: {p.report_date}
                                </div>
                                <div className="text-muted-foreground">
                                  Spend diversity: {d.toFixed(2)} ({diversityLabel})
                                </div>
                                <div className="text-muted-foreground">{p.primary_category}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Click to read full story
                                </div>
                              </div>
                            )
                          }}
                        />
                        <Scatter
                          data={scatterPoints}
                          name="Projects"
                          shape={(props: { cx?: number; cy?: number; payload?: { primary_category?: string } }) => {
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
                            if (id)
                              router.push(
                                `/err-portal/stories/${id}${fromQuery ? `?${fromQuery}` : ''}`
                              )
                          }}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Y axis: from focused (one theme) to very spread out (across many themes).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {[...categoryColorIndex.entries()]
                    .sort((a, b) => a[1] - b[1])
                    .map(([cat, idx]) => (
                      <span key={cat} className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                          }}
                        />
                        {cat}
                      </span>
                    ))}
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((c) => (
                  <Card key={c.project_id} className="flex flex-col">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        {c.project_name || 'Unnamed project'}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {[c.state, c.locality].filter(Boolean).join(' · ') || '—'}
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
                    <CardFooter>
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/err-portal/stories/${c.project_id}${fromQuery ? `?${fromQuery}` : ''}`}
                        >
                          Read full story
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
