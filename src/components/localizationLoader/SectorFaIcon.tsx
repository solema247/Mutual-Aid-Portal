import { SECTOR_FA_ICONS, type SectorFaIconId } from './sectorIconPaths'

type SectorFaIconProps = {
  icon: SectorFaIconId
  className?: string
}

/** Inline SVG matching Font Awesome 6 solid glyphs from the reference loader. */
export default function SectorFaIcon({ icon, className }: SectorFaIconProps) {
  const { viewBox, path } = SECTOR_FA_ICONS[icon]
  return (
    <svg
      className={className}
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      <path d={path} />
    </svg>
  )
}
