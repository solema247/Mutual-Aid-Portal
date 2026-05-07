import { NextResponse } from 'next/server'
import { sanitizeModelJsonOutput } from '@/lib/geminiStructureOcrText'
import { createGeminiParseSnipsResilient } from '@/lib/geminiParseSnipsResilient'
import mammoth from 'mammoth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** F5 wizard (`/api/f5/parse-snips`). Set `GEMINI_F5_PARSE_SNIPS_MODEL=gemini-2.5-flash` to force full Flash. */
const F5_PARSE_SNIPS_MODEL =
  process.env.GEMINI_F5_PARSE_SNIPS_MODEL?.trim() || 'gemini-2.5-flash-lite'

const F5_PARSE_SNIPS_FALLBACK_MODEL = 'gemini-2.5-flash'

/** Narrative answers + Arabic text can exceed 8k output tokens; truncation yields "Unterminated string" in JSON.parse */
const F5_QUESTIONS_MAX_OUTPUT = 32_768
const F5_GRID_MAX_OUTPUT = 12_288
/** Repair must be able to emit a full JSON copy of long malformed output */
const F5_JSON_REPAIR_MAX_OUTPUT = 32_768

const { generateContentResilient } = createGeminiParseSnipsResilient({
  logPrefix: '[F5 parse-snips]',
  primaryModelId: F5_PARSE_SNIPS_MODEL,
  fallbackModelId: F5_PARSE_SNIPS_FALLBACK_MODEL,
  temperatureDefault: 0,
})

type SnipKind = 'activities' | 'demographics' | 'questions'

async function toInlineParts (files: File[]) {
  const parts: Array<{ inlineData?: { mimeType: string, data: string }, text?: string }> = []
  for (const file of files) {
    const lowerName = String(file.name || '').toLowerCase()
    const mimeType = file.type || 'application/octet-stream'
    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)
    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lowerName.endsWith('.docx')
    if (isDocx) {
      const extracted = await mammoth.extractRawText({ buffer: buf })
      parts.push({ text: extracted.value || '' })
      continue
    }
    const base64 = buf.toString('base64')
    parts.push({
      inlineData: { mimeType, data: base64 },
    })
  }
  return parts
}

async function parseJsonWithRepair (rawText: string) {
  const safeParse = (text: string) => {
    try {
      return JSON.parse(text)
    } catch {
      const escaped = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
      return JSON.parse(escaped)
    }
  }
  const sanitized = sanitizeModelJsonOutput(rawText)
  try {
    return safeParse(sanitized)
  } catch (firstErr) {
    console.warn('[F5 parse-snips] JSON_PARSE_RETRY', {
      sanitizedChars: sanitized.length,
      firstError: firstErr instanceof Error ? firstErr.message : String(firstErr),
      tail200: sanitized.slice(-200),
    })
    const repairResult = await generateContentResilient(
      'You will receive malformed JSON. Return STRICT valid JSON only, no markdown. Keep key names; only repair escapes, quotes, commas, and brackets. If the input was truncated mid-string, complete missing closing quotes/braces and use null for fields you cannot recover.',
      F5_JSON_REPAIR_MAX_OUTPUT,
      undefined,
      [
        { text: 'Repair this JSON and return valid JSON only:' },
        { text: sanitized },
      ] as any
    )
    const repaired = sanitizeModelJsonOutput(repairResult.response.text())
    try {
      return safeParse(repaired)
    } catch (repairErr) {
      console.error('[F5 parse-snips] JSON_PARSE_REPAIR_FAILED', {
        repairedChars: repaired.length,
        repairError: repairErr instanceof Error ? repairErr.message : String(repairErr),
        tail200: repaired.slice(-200),
      })
      throw repairErr
    }
  }
}

function toFiniteInt (value: unknown): number | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.floor(n)
}

function normalizeActivities (parsed: Record<string, unknown>) {
  const rows = Array.isArray(parsed.reach) ? parsed.reach : []
  return rows.map((row: any) => ({
    activity_name: row?.activity_name != null ? String(row.activity_name) : '',
    activity_goal: row?.activity_goal != null ? String(row.activity_goal) : '',
    location: row?.location != null ? String(row.location) : '',
    start_date: row?.start_date != null ? String(row.start_date) : '',
    end_date: row?.end_date != null ? String(row.end_date) : '',
    individual_count: toFiniteInt(row?.individual_count),
    household_count: toFiniteInt(row?.household_count),
  }))
}

function normalizeDemographics (parsed: Record<string, unknown>) {
  const rows = Array.isArray(parsed.reach) ? parsed.reach : []
  return rows.map((row: any) => ({
    activity_name: row?.activity_name != null ? String(row.activity_name) : '',
    male_count: toFiniteInt(row?.male_count),
    female_count: toFiniteInt(row?.female_count),
    under18_male: toFiniteInt(row?.under18_male),
    under18_female: toFiniteInt(row?.under18_female),
    people_with_disabilities: toFiniteInt(row?.people_with_disabilities),
  }))
}

const ACTIVITIES_INSTRUCTION = `You read screenshot snippets from an F5 program report.
Extract ONLY the activities rows that contain table cells for activities + individuals/families counts.
Return STRICT JSON:
{
  "reach": Array<{
    "activity_name": string,
    "activity_goal": string | null,
    "location": string | null,
    "start_date": string | null,
    "end_date": string | null,
    "individual_count": number | null,
    "household_count": number | null
  }>
}
Rules:
- Include all visible rows that are actual activity rows.
- Keep row order as shown.
- Use null when a value is truly missing.
- Return JSON only.`

const DEMOGRAPHICS_INSTRUCTION = `You read screenshot snippets from an F5 program report.
Extract ONLY demographics breakdown rows.
Return STRICT JSON:
{
  "reach": Array<{
    "activity_name": string | null,
    "male_count": number | null,
    "female_count": number | null,
    "under18_male": number | null,
    "under18_female": number | null,
    "people_with_disabilities": number | null
  }>
}
Rules:
- Include all visible rows that represent activity demographics.
- Keep row order as shown.
- Return null for values not visible.
- Return JSON only.`

const QUESTIONS_INSTRUCTION = `You read screenshot snippets from an F5 program report.
Extract ONLY narrative/question answers.
Return STRICT JSON:
{
  "positive_changes": string | null,
  "negative_results": string | null,
  "unexpected_results": string | null,
  "lessons_learned": string | null,
  "suggestions": string | null,
  "reporting_person": string | null
}
Rules:
- Return answer text only, never question text.
- Keep original language.
- Use null only when no answer is visible.
- Return JSON only.`

async function parseWithGemini (kind: SnipKind, files: File[]) {
  const parts = await toInlineParts(files)
  const instruction =
    kind === 'activities'
      ? ACTIVITIES_INSTRUCTION
      : kind === 'demographics'
        ? DEMOGRAPHICS_INSTRUCTION
        : QUESTIONS_INSTRUCTION
  const maxOut = kind === 'questions' ? F5_QUESTIONS_MAX_OUTPUT : F5_GRID_MAX_OUTPUT
  const result = await generateContentResilient(instruction, maxOut, undefined, parts as any)
  return parseJsonWithRepair(result.response.text()) as Promise<Record<string, unknown>>
}

export async function POST (request: Request) {
  try {
    const form = await request.formData()
    const kindRaw = String(form.get('kind') || '').toLowerCase()
    if (!['activities', 'demographics', 'questions'].includes(kindRaw)) {
      return NextResponse.json({ error: 'kind must be activities|demographics|questions' }, { status: 400 })
    }
    const kind = kindRaw as SnipKind
    const files = form.getAll('files').filter(Boolean) as File[]
    if (!files.length) {
      return NextResponse.json({ error: 'No snippet files provided' }, { status: 400 })
    }

    console.log('[F5 parse-snips] START', {
      kind,
      model: F5_PARSE_SNIPS_MODEL,
      fileCount: files.length,
      files: files.map(f => ({ name: f.name, mime: f.type || '(unknown)', bytes: f.size })),
      ts: new Date().toISOString(),
    })

    const parsed = await parseWithGemini(kind, files)

    if (kind === 'activities') return NextResponse.json({ reach: normalizeActivities(parsed) })
    if (kind === 'demographics') return NextResponse.json({ reach: normalizeDemographics(parsed) })
    return NextResponse.json({
      positive_changes: parsed.positive_changes ?? null,
      negative_results: parsed.negative_results ?? null,
      unexpected_results: parsed.unexpected_results ?? null,
      lessons_learned: parsed.lessons_learned ?? null,
      suggestions: parsed.suggestions ?? null,
      reporting_person: parsed.reporting_person ?? null,
    })
  } catch (e) {
    console.error('[F5 parse-snips] error', e)
    return NextResponse.json({ error: 'Failed to parse snippets' }, { status: 500 })
  }
}
