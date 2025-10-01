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

    console.log('Finalize upload - temp_key:', temp_key, 'final_path:', final_path)

    // Check if temp file exists first
    const { data: tempFile, error: listError } = await supabase.storage
      .from('images')
      .list('f1-forms/_incoming', {
        search: temp_key.split('/').pop()
      })

    if (listError) {
      console.error('Error listing temp files:', listError)
      return NextResponse.json({ error: 'Temp file not found' }, { status: 404 })
    }

    if (!tempFile || tempFile.length === 0) {
      console.error('Temp file not found in storage:', temp_key)
      return NextResponse.json({ error: 'Temp file not found' }, { status: 404 })
    }

    console.log('Temp file found:', tempFile[0])

    // Try move; if move isn't supported by client, copy then remove
    // Supabase JS supports move on Storage
    const { data, error } = await supabase.storage.from('images').move(temp_key, final_path)
    if (error) {
      console.log('Move failed, trying copy:', error)
      // Fallback: copy then remove
      const { error: copyErr } = await supabase.storage.from('images').copy(temp_key, final_path)
      if (copyErr) {
        console.error('Copy failed:', copyErr)
        throw copyErr
      }
      const { error: rmErr } = await supabase.storage.from('images').remove([temp_key])
      if (rmErr) {
        console.error('Remove failed:', rmErr)
        throw rmErr
      }
    }

    console.log('File moved successfully to:', final_path)
    return NextResponse.json({ ok: true, final_path })
  } catch (error) {
    console.error('Finalize upload error:', error)
    return NextResponse.json({ error: 'Failed to finalize upload' }, { status: 500 })
  }
}


