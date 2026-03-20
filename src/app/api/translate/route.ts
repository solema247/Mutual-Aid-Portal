import { NextResponse } from 'next/server'

/** Google Translate API v2 allows max 128 text segments per request. */
const MAX_SEGMENTS_PER_REQUEST = 128

/** Translate one or more texts from source to target. Batch: body { texts: string[], source, target } -> { translations: string[] }. Single: body { q, source, target } -> { translatedText: string }. Batches of 128+ are chunked automatically. */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { source, target } = body
    const single = body.q != null
    const texts: string[] = single ? [String(body.q)] : Array.isArray(body.texts) ? body.texts.map(String) : []

    if (!source || !target || (!single && texts.length === 0) || (single && !body.q)) {
      return NextResponse.json({ error: 'Missing q or texts, and source/target' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
    if (!apiKey) {
      console.error('Google Translate API key not found')
      return NextResponse.json({ error: 'Translation service not configured' }, { status: 500 })
    }

    if (single) {
      const q = texts[0]!
      console.log(`[translate] Google Translate: src=${source} tgt=${target}, count=1`)
      const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, source, target, format: 'text' }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[translate] Google API failed: ${response.status} - ${errorText}`)
        return NextResponse.json({ error: 'Translation failed', details: errorText }, { status: response.status })
      }
      const result = await response.json()
      const translations = result.data?.translations as Array<{ translatedText: string }> | undefined
      const translatedText = translations?.[0]?.translatedText ?? ''
      return NextResponse.json({ translatedText, endpoint: 'Google Translate API' })
    }

    const total = texts.length
    console.log(`[translate] Google Translate: src=${source} tgt=${target}, count=${total} (chunked)`)

    const allTranslations: string[] = []
    for (let i = 0; i < texts.length; i += MAX_SEGMENTS_PER_REQUEST) {
      const chunk = texts.slice(i, i + MAX_SEGMENTS_PER_REQUEST)
      const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: chunk,
          source,
          target,
          format: 'text',
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        console.error(`[translate] Google API failed: ${response.status} - ${errorText}`)
        return NextResponse.json({
          error: 'Translation failed',
          details: errorText,
        }, { status: response.status })
      }
      const result = await response.json()
      const translations = result.data?.translations as Array<{ translatedText: string }> | undefined
      if (!translations?.length) {
        console.error('[translate] No translation in chunk response:', result)
        return NextResponse.json({ error: 'No translation returned' }, { status: 500 })
      }
      allTranslations.push(...translations.map((t) => t.translatedText ?? ''))
    }

    return NextResponse.json({
      translations: allTranslations,
      endpoint: 'Google Translate API',
    })
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({
      error: 'Server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}


