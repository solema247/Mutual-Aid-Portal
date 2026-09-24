import fs from 'node:fs'

const icons = [
  'heart-pulse',
  'bowl-food',
  'droplet',
  'house-chimney',
  'shield-halved',
  'leaf',
  'graduation-cap',
  'people-group',
]

const out = {}
for (const name of icons) {
  const r = await fetch(
    `https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.4.0/svgs/solid/${name}.svg`,
  )
  const t = await r.text()
  const viewBox = t.match(/viewBox="([^"]+)"/)?.[1]
  const path = t.match(/<path d="([^"]+)"/)?.[1]
  if (!viewBox || !path) throw new Error(`Failed ${name}`)
  out[name] = { viewBox, path }
}

const ts = `/** Font Awesome Free 6.4.0 paths (embedded, no CDN). Icons: CC BY 4.0 */
export type SectorFaIconId = keyof typeof SECTOR_FA_ICONS

export const SECTOR_FA_ICONS = ${JSON.stringify(out, null, 2)} as const
`

fs.writeFileSync(
  new URL('../src/components/localizationLoader/sectorIconPaths.ts', import.meta.url),
  ts,
  'utf8',
)
console.log('Wrote sectorIconPaths.ts')
