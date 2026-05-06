import { GoogleGenerativeAI } from '@google/generative-ai'

let genAI: GoogleGenerativeAI | null = null

function getGenAI (): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY not set. Add GEMINI_API_KEY=<your-key> to .env.local, then restart the dev server.'
      )
    }
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

/** Normalize Gemini JSON output for JSON.parse (fences, control chars, bad backslashes). */
export function sanitizeModelJsonOutput (raw: string): string {
  let sanitizedContent = raw
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/^```[a-zA-Z]*\n|```$/g, '')

  let inString = false
  let result = ''
  for (let i = 0; i < sanitizedContent.length; i++) {
    const char = sanitizedContent[i]

    if (char === '"') {
      let backslashCount = 0
      let j = i - 1
      while (j >= 0 && sanitizedContent[j] === '\\') {
        backslashCount++
        j--
      }
      if (backslashCount % 2 === 0) {
        inString = !inString
      }
      result += char
      continue
    }

    if (inString && char === '\\') {
      const nextChar = i + 1 < sanitizedContent.length ? sanitizedContent[i + 1] : ''
      const validEscapes = ['"', '\\', '/', 'b', 'f', 'n', 'r', 't']
      const isUnicodeEscape =
        nextChar === 'u' &&
        i + 5 < sanitizedContent.length &&
        /^u[0-9a-fA-F]{4}/.test(sanitizedContent.substring(i + 1, i + 6))

      if (validEscapes.includes(nextChar) || isUnicodeEscape) {
        result += char
      } else {
        result += '\\\\'
      }
    } else {
      result += char
    }
  }

  return result
}

/**
 * Map OCR / extracted plain text to structured form JSON using Gemini (same model family as extraction).
 */
export async function generateStructuredFormJson (
  systemInstruction: string,
  ocrText: string
): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    },
  })
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: ocrText }] }],
  })
  const out = result.response.text()
  if (!out?.trim()) {
    throw new Error('Empty response from Gemini form structuring')
  }
  return out
}

/** One-shot repair of malformed JSON (used when F5 parse fails). */
export async function repairMalformedJsonWithGemini (malformedJson: string): Promise<string> {
  const model = getGenAI().getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction:
      'You will receive possibly malformed JSON. Return STRICT, MINIFIED JSON only (no code fences, no prose). Use exactly these keys: raw_ocr, language, date, reach (array of objects with activity_name, activity_goal, location, start_date, end_date, individual_count, household_count, male_count, female_count, under18_male, under18_female), positive_changes, negative_results, unexpected_results, lessons_learned, suggestions, reporting_person.',
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    },
  })
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: malformedJson }] }],
  })
  const out = result.response.text()
  if (!out?.trim()) {
    throw new Error('Empty response from Gemini JSON repair')
  }
  return out
}
