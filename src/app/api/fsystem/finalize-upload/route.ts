import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// POST /api/fsystem/finalize-upload
// body: { temp_key: string, final_path: string }
export async function POST(request: Request) {
  try {
    const { temp_key, final_path } = await request.json()
    if (!temp_key || !final_path) {
      return NextResponse.json({ error: 'temp_key and final_path are required' }, { status: 400 })
    }

    // Try move; if move isn't supported by client, copy then remove
    // Supabase JS supports move on Storage
    const { data, error } = await supabase.storage.from('images').move(temp_key, final_path)
    if (error) {
      // Fallback: copy then remove
      const { error: copyErr } = await supabase.storage.from('images').copy(temp_key, final_path)
      if (copyErr) throw copyErr
      const { error: rmErr } = await supabase.storage.from('images').remove([temp_key])
      if (rmErr) throw rmErr
    }

    return NextResponse.json({ ok: true, final_path })
  } catch (error) {
    console.error('Finalize upload error:', error)
    return NextResponse.json({ error: 'Failed to finalize upload' }, { status: 500 })
  }
}


