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
  if (!viewBox || !path) {
    console.error('failed', name)
    process.exit(1)
  }
  out[name] = { viewBox, path }
}
console.log(JSON.stringify(out, null, 2))
