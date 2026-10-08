import type { SectorFaIconId } from './sectorIconPaths'

export type LocalizationSector = {
  id: string
  name: string
  color: string
  angle: number
  icon: SectorFaIconId
}

/** Matches `SECTORS` in localization_hub_neon_loader.html */
export const LOCALIZATION_LOADER_SECTORS: LocalizationSector[] = [
  { id: 'health', name: 'Health', icon: 'heart-pulse', color: '#E53935', angle: 270 },
  { id: 'food', name: 'Food Security', icon: 'bowl-food', color: '#F58220', angle: 315 },
  { id: 'wash', name: 'WASH', icon: 'droplet', color: '#00A896', angle: 0 },
  { id: 'shelter', name: 'Shelter & NFIs', icon: 'house-chimney', color: '#0072BC', angle: 45 },
  { id: 'protection', name: 'Protection', icon: 'shield-halved', color: '#6B2C91', angle: 90 },
  { id: 'livelihoods', name: 'Livelihoods', icon: 'leaf', color: '#4CAF50', angle: 135 },
  { id: 'education', name: 'Education', icon: 'graduation-cap', color: '#FFB300', angle: 180 },
  { id: 'volunteer', name: 'Volunteer Support', icon: 'people-group', color: '#0284C7', angle: 225 },
]

export const LOADER_ORBIT_RADIUS = 145
export const LOADER_VIEW_SIZE = 400

export function sectorPosition(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180
  const cx = LOADER_VIEW_SIZE / 2
  const cy = LOADER_VIEW_SIZE / 2
  const x = cx + LOADER_ORBIT_RADIUS * Math.cos(rad)
  const y = cy + LOADER_ORBIT_RADIUS * Math.sin(rad)
  return {
    leftPercent: (x / LOADER_VIEW_SIZE) * 100,
    topPercent: (y / LOADER_VIEW_SIZE) * 100,
  }
}
