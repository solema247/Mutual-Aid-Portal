import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const { project_id, ext } = await req.json()
    if (!project_id || !ext) return NextResponse.json({ error: 'project_id and ext required' }, { status: 400 })
    const key = `f4-financial-reports/${project_id}/tmp/${Date.now()}.${ext}`
    // Optional: pre-signed upload URL if using S3; with Supabase we upload client-side via SDK
    return NextResponse.json({ file_key_temp: key })
  } catch (e) {
    console.error('F4 upload init error', e)
    return NextResponse.json({ error: 'Failed to init upload' }, { status: 500 })
  }
}


