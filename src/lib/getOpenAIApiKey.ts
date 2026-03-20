import fs from 'fs'
import path from 'path'

/** OPEN_API_KEY is a common typo for OPENAI_API_KEY */
const OPENAI_ENV_NAMES = ['OPENAI_API_KEY', 'OPEN_API_KEY', 'OPENAI_KEY', 'OPENAI_SECRET'] as const

function parseValueFromLine(line: string): string | null {
  let val = line.trim()
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1)
  }
  val = val.trim()
  return val || null
}

/**
 * OPENAI key from project root .env.local (when Next did not inject it).
 */
function parseOpenAIKeyFromEnvLocalFile(): string | null {
  try {
    const envPath = path.join(process.cwd(), '.env.local')
    if (!fs.existsSync(envPath)) return null
    let text = fs.readFileSync(envPath, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    const lines = text.split(/\r?\n/)
    for (const name of OPENAI_ENV_NAMES) {
      const re = new RegExp(`^(?:export\\s+)?${name}\\s*=\\s*(.*)$`)
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const m = trimmed.match(re)
        if (!m) continue
        const val = parseValueFromLine(m[1])
        if (val) return val
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Resolves OpenAI API key for server-side use (F4 parse, fsystem, sheets).
 * Order: process.env → .env.local on disk → OPENAI_API_KEY_FILE → openai-key.txt
 */
export function getOpenAIApiKey(): string | null {
  for (const name of OPENAI_ENV_NAMES) {
    const v = process.env[name]?.trim()
    if (v) return v
  }

  let apiKey = parseOpenAIKeyFromEnvLocalFile() || null
  if (apiKey) return apiKey

  if (process.env.OPENAI_API_KEY_FILE) {
    try {
      apiKey = fs
        .readFileSync(path.resolve(process.env.OPENAI_API_KEY_FILE.trim()), 'utf8')
        .trim()
      if (apiKey) return apiKey
    } catch {
      // fall through
    }
  }

  const fallbackPath = path.join(process.cwd(), 'openai-key.txt')
  try {
    if (fs.existsSync(fallbackPath)) {
      apiKey = fs.readFileSync(fallbackPath, 'utf8').trim()
      if (apiKey) return apiKey
    }
  } catch {
    // ignore
  }

  return null
}
