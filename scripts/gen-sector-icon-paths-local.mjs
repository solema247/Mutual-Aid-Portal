import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const jsonPath = path.join(root, 'fa-loader-icons.json')
const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const ts = `/** Font Awesome Free 6.4.0 paths (embedded, no CDN). Icons: CC BY 4.0 */
export type SectorFaIconId = keyof typeof SECTOR_FA_ICONS

export const SECTOR_FA_ICONS = ${JSON.stringify(j, null, 2)} as const
`
const outPath = path.join(root, '../src/components/localizationLoader/sectorIconPaths.ts')
fs.writeFileSync(outPath, ts, 'utf8')
console.log('Wrote', outPath)
