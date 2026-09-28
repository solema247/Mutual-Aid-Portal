import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActivePublic } from '@/lib/sbEnv'

export async function GET(request: Request) {
  try {
    const { url, anonKey } = getActivePublic()
    const client = createClient(url, anonKey)

    const { searchParams } = new URL(request.url)
    const bucket = searchParams.get('bucket') || 'images'
    const path = searchParams.get('path')
    if (!path) {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }
    const { data, error } = await client.storage.from(bucket).createSignedUrl(path, 60 * 60)
    if (error) throw error
    return NextResponse.json({ url: data?.signedUrl || null })
  } catch (error) {
    console.error('Signed URL error:', error)
    return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })
  }
}
