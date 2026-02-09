import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { q, source, target } = await request.json()
    if (!q || !source || !target) {
      return NextResponse.json({ error: 'Missing q/source/target' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY
    if (!apiKey) {
      console.error('Google Translate API key not found')
      return NextResponse.json({ error: 'Translation service not configured' }, { status: 500 })
    }

    console.log(`[translate] Google Translate: src=${source} tgt=${target}, len=${String(q).length}`)
    
    const response = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        q, 
        source, 
        target, 
        format: 'text' 
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[translate] Google API failed: ${response.status} - ${errorText}`)
      return NextResponse.json({ 
        error: 'Translation failed', 
        details: errorText 
      }, { status: response.status })
    }

    const result = await response.json()
    const translatedText = result.data?.translations?.[0]?.translatedText

    if (!translatedText) {
      console.error('[translate] No translation in response:', result)
      return NextResponse.json({ 
        error: 'No translation returned' 
      }, { status: 500 })
    }

    console.log(`[translate] Success: "${q.substring(0, 50)}..." -> "${translatedText.substring(0, 50)}..."`)
    return NextResponse.json({ 
      translatedText,
      endpoint: 'Google Translate API'
    })

  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({ 
      error: 'Server error', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 })
  }
}


