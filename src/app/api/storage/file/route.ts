import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getActiveService } from '@/lib/sbEnv'

function safeStoragePath(path: string): string | null {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) return null
  return trimmed
}

function filenameFromPath(path: string): string {
  const base = path.split('/').pop() || 'file'
  return base.replace(/[^\w.\-()+\s[\]]+/g, '_')
}

/** GET /api/storage/file?path=...&bucket=images — stream object via app (no Supabase token in address bar) */
export async function GET(request: Request) {
  try {
    const routeClient = getSupabaseRouteClient()
    const {
      data: { session },
    } = await routeClient.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucket') || 'images'
    const rawPath = searchParams.get('path')
    if (!rawPath) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }
    const path = safeStoragePath(rawPath)
    if (!path) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }

    const { url, serviceRoleKey } = getActiveService()
    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.storage.from(bucket).download(path)
    if (error || !data) {
      console.error('storage file download:', error)
      const accept = request.headers.get('accept') || ''
      if (accept.includes('text/html')) {
        return new NextResponse(
          `<!doctype html><html><body style="font-family:sans-serif;padding:2rem">
            <h1>File not found</h1>
            <p>This F1 document is missing from storage. The path may have been moved or never uploaded.</p>
            <p style="color:#666;word-break:break-all"><code>${path.replace(/[<>&]/g, '')}</code></p>
          </body></html>`,
          { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      }
      return NextResponse.json({ error: 'Object not found' }, { status: 404 })
    }

    const contentType = data.type || 'application/octet-stream'
    const filename = filenameFromPath(path)
    const buffer = Buffer.from(await data.arrayBuffer())

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(buffer.length),
      },
    })
  } catch (e) {
    console.error('GET /api/storage/file:', e)
    return NextResponse.json({ error: 'Failed to fetch file' }, { status: 500 })
  }
}
