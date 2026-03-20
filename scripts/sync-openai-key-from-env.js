#!/usr/bin/env node
/**
 * Writes project root openai-key.txt from OPENAI_API_KEY in .env.local
 * Run: npm run sync:openai-key  (from project root)
 */
const path = require('path')
const fs = require('fs')
const envPath = path.join(__dirname, '..', '.env.local')
require('dotenv').config({ path: envPath })

const NAMES = ['OPENAI_API_KEY', 'OPEN_API_KEY', 'OPENAI_KEY', 'OPENAI_SECRET']
let key = NAMES.map((n) => process.env[n]?.trim()).find(Boolean)
if (!key && fs.existsSync(envPath)) {
  let text = fs.readFileSync(envPath, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const name of NAMES) {
    const re = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(.*)$`)
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const m = t.match(re)
      if (m) {
        key = m[1].trim()
        if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
          key = key.slice(1, -1).trim()
        }
        break
      }
    }
    if (key) break
  }
}
if (!key) {
  console.error('No OpenAI key in .env.local. Use OPENAI_API_KEY=sk-... (not OPEN_API_KEY — missing "AI").')
  process.exit(1)
}

const out = path.join(__dirname, '..', 'openai-key.txt')
fs.writeFileSync(out, key + '\n', 'utf8')
const used = NAMES.find((n) => process.env[n]?.trim())
console.log('Wrote', out, used ? `(from ${used} in .env.local)` : '(parsed from .env.local)')
