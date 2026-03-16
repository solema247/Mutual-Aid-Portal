'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import MapLibre, { Layer, Source } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

const GEO_URL = '/geo/sudan-states.json'
const FILL_LAYER_ID = 'sudan-states-fill'
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json'

/** Map label -> API state name (for onClick). */
const MAP_TO_API: Record<string, string> = {
  'Al Jazirah': 'Al Jazirah',
}
/** API state name -> map label (for highlighting). */
const API_TO_MAP: Record<string, string> = {
  Gezira: 'Al Jazirah',
}

function getStateNameForApi(geoName: string): string {
  return MAP_TO_API[geoName] ?? geoName
}

function getMapNameForApi(apiName: string): string {
  return API_TO_MAP[apiName] ?? apiName
}

interface SudanMapProps {
  selectedState: string | null
  onSelectState: (state: string) => void
  stateCounts?: Map<string, number>
  disabled?: boolean
}

interface GeoFeature {
  type: 'Feature'
  properties: { name?: string; _count?: number; _selected?: boolean }
  geometry: GeoJSON.Geometry
}

interface GeoCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

export function SudanMap({
  selectedState,
  onSelectState,
  stateCounts = new Map(),
  disabled = false,
}: SudanMapProps) {
  const [geo, setGeo] = useState<GeoCollection | null>(null)

  useEffect(() => {
    fetch(GEO_URL)
      .then((r) => r.json())
      .then((data: GeoCollection) => setGeo(data))
  }, [])

  const enrichedGeo = useMemo(() => {
    if (!geo) return null
    return {
      ...geo,
      features: geo.features.map((f) => {
        const mapName = f.properties?.name ?? ''
        const apiName = getStateNameForApi(mapName)
        const selectedMapName = selectedState ? getMapNameForApi(selectedState) : null
        const count =
          stateCounts.get(apiName) ?? (mapName === 'Al Jazirah' ? stateCounts.get('Gezira') : 0) ?? 0
        return {
          ...f,
          properties: {
            ...f.properties,
            _count: count,
            _selected: !!selectedState && selectedMapName === mapName,
          },
        }
      }),
    }
  }, [geo, selectedState, stateCounts])

  const handleClick = useCallback(
    (e: { features?: Array<{ properties?: { name?: string } }> }) => {
      if (disabled) return
      const name = e.features?.[0]?.properties?.name
      if (typeof name === 'string') {
        onSelectState(getStateNameForApi(name))
      }
    },
    [disabled, onSelectState]
  )

  if (!geo) {
    return (
      <div className="w-full aspect-[4/5] max-h-[420px] min-h-[280px] rounded-lg border overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    )
  }

  return (
    <div className="w-full aspect-[4/5] max-h-[420px] min-h-[280px] rounded-lg border overflow-hidden bg-slate-100 dark:bg-slate-800">
      <MapLibre
        initialViewState={{
          longitude: 30,
          latitude: 14,
          zoom: 5,
        }}
        mapStyle={MAP_STYLE}
        style={{ width: '100%', height: '100%', minHeight: 280 }}
        interactiveLayerIds={[FILL_LAYER_ID]}
        onClick={handleClick}
        cursor={disabled ? 'default' : 'pointer'}
      >
        <Source id="sudan-states" type="geojson" data={enrichedGeo ?? geo} />
        <Layer
          id={FILL_LAYER_ID}
          type="fill"
          source="sudan-states"
          paint={{
            'fill-color': [
              'case',
              ['get', '_selected'],
              '#0ea5e9',
              ['case', ['>', ['get', '_count'], 0], '#7dd3fc', '#e2e8f0'],
            ],
            'fill-opacity': disabled ? 0.6 : 1,
          }}
        />
        <Layer
          id="sudan-states-line"
          type="line"
          source="sudan-states"
          paint={{
            'line-color': '#64748b',
            'line-width': 0.8,
          }}
        />
      </MapLibre>
    </div>
  )
}
