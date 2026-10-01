import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActiveService } from '@/lib/sbEnv'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

function safeStoragePath(path: string): string | null {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed.includes('..') || trimmed.includes('\\')) return null
  return trimmed
}

// GET /api/storage/signed-url?path=...&bucket=images
// Requires a logged-in session; signs with the service role so storage RLS
// cannot block legitimate portal users from opening F1/MOU docs.
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
    const client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 60)
    if (error) {
      console.error('Signed URL storage error:', error.message)
      return NextResponse.json(
        { error: error.message || 'Object not found', url: null },
        { status: 404 }
      )
    }
    return NextResponse.json({ url: data?.signedUrl || null })
  } catch (error) {
    console.error('Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })
  }
}
