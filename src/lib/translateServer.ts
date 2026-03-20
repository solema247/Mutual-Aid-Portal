/**
 * Server-side Google Translate (same logic as /api/translate) for use in API routes.
 * Use for translate-and-cache so we don't call our own HTTP endpoint.
 */

const MAX_SEGMENTS_PER_REQUEST = 128

export async function translateBatch(
  texts: string[],
  source: string,
  target: string
): Promise<string[]> {
  if (texts.length === 0) return []
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
  if (!apiKey) {
    throw new Error('Translation service not configured (GOOGLE_TRANSLATE_API_KEY missing)')
  }
  const allTranslations: string[] = []
  for (let i = 0; i < texts.length; i += MAX_SEGMENTS_PER_REQUEST) {
    const chunk = texts.slice(i, i + MAX_SEGMENTS_PER_REQUEST)
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: chunk,
          source,
          target,
          format: 'text',
        }),
      }
    )
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[translateServer] Google API failed:', response.status, errorText)
      throw new Error(`Translation failed: ${response.status}`)
    }
    const result = await response.json()
    const translations = (result.data?.translations as Array<{ translatedText: string }> | undefined) ?? []
    allTranslations.push(...translations.map((t) => t.translatedText ?? ''))
  }
  return allTranslations
}
