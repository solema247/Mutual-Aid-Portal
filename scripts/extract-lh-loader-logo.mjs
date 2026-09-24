import fs from 'node:fs'

const htmlPath = process.argv[2]
const outPath = process.argv[3]
if (!htmlPath || !outPath) {
  console.error('Usage: node extract-lh-loader-logo.mjs <html> <out.webp>')
  process.exit(1)
}
const html = fs.readFileSync(htmlPath, 'utf8')
const m = html.match(/const LOGO_DATA_URI = "(data:image\/webp;base64,[^"]+)"/)
if (!m) {
  console.error('LOGO_DATA_URI not found')
  process.exit(1)
}
const b64 = m[1].replace(/^data:image\/webp;base64,/, '')
fs.writeFileSync(outPath, Buffer.from(b64, 'base64'))
console.log('Wrote', outPath, 'bytes', Buffer.from(b64, 'base64').length)
