import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/requirePermission'

export async function POST(request: Request) {
  try {
    const auth = await requirePermission('f4_upload')
    if (auth instanceof NextResponse) return auth
    const { project_id, ext } = await request.json()
    if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 })
    const safeExt = typeof ext === 'string' && ext.length <= 6 ? ext.toLowerCase().replace(/[^a-z0-9]/g,'') : 'pdf'
    const file_key_temp = `f4-financial-reports/${project_id}/tmp/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`
    return NextResponse.json({ file_key_temp })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to init upload' }, { status: 500 })
  }
}

 
