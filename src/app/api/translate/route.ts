import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { q, source, target } = await request.json()
    if (!q || !source || !target) {
      return NextResponse.json({ error: 'Missing q/source/target' }, { status: 400 })
    }
    const body = JSON.stringify({ q, source, target, format: 'text' })

    const endpoints = [
      process.env.LIBRE_TRANSLATE_URL || '',
      'https://translate.mentality.rip/translate',
      'https://libretranslate.de/translate'
    ].filter(Boolean)

    let lastError: any = null
    let lastEndpoint = ''
    for (const url of endpoints) {
      try {
        lastEndpoint = url
        console.log(`[translate] trying endpoint: ${url} src=${source} tgt=${target}, len=${String(q).length}`)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
          redirect: 'follow'
        })
        clearTimeout(timer)
        if (!resp.ok) {
          lastError = await resp.text()
          console.warn(`[translate] endpoint failed: ${url} status=${resp.status} body=${lastError?.slice?.(0,200)}`)
          continue
        }
        const json = await resp.json()
        console.log(`[translate] success via ${url}`)
        return NextResponse.json({ ...json, endpoint: url })
      } catch (e: any) {
        lastError = e?.message || String(e)
        console.warn(`[translate] error calling ${lastEndpoint}: ${lastError}`)
        continue
      }
    }
    console.warn(`[translate] all endpoints failed, returning fallback. lastError=${lastError}`)
    return NextResponse.json({ translatedText: q, warning: 'Translation unavailable', info: lastError, endpoint: lastEndpoint }, { status: 200 })
  } catch (error) {
    console.error('Translation proxy error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}


