import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { project_id, temp_file_key, donor_id, state_short, mmyy, grant_id } = await request.json()
    
    if (!project_id || !temp_file_key || !donor_id || !state_short || !mmyy || !grant_id) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }
    
    // Get donor short name
    const { data: donor, error: donorError } = await supabase
      .from('donors')
      .select('short_name')
      .eq('id', donor_id)
      .single()
    
    if (donorError || !donor) {
      return NextResponse.json({ error: 'Donor not found' }, { status: 404 })
    }
    
    // Construct final path
    const ext = temp_file_key.split('.').pop()
    const finalPath = `f1-forms/${donor.short_name}/${state_short}/${mmyy}/${grant_id}.${ext}`
    
    // Move file from temp to final location
    const { error: moveError } = await supabase.storage
      .from('images')
      .move(temp_file_key, finalPath)
    
    if (moveError) {
      console.error('Move failed, trying copy:', moveError)
      // Fallback: copy then remove
      const { error: copyErr } = await supabase.storage.from('images').copy(temp_file_key, finalPath)
      if (copyErr) {
        console.error('Copy failed:', copyErr)
        throw copyErr
      }
      const { error: rmErr } = await supabase.storage.from('images').remove([temp_file_key])
      if (rmErr) {
        console.error('Remove failed:', rmErr)
        throw rmErr
      }
    }
    
    // Update database with final file path and metadata
    const { error: updateError } = await supabase
      .from('err_projects')
      .update({
        file_key: finalPath,
        temp_file_key: null, // Clear temp key
        donor_id: donor_id,
        status: 'pending' // Update status
      })
      .eq('id', project_id)
    
    if (updateError) throw updateError
    
    return NextResponse.json({ success: true, final_path: finalPath })
  } catch (error) {
    console.error('Error moving file:', error)
    return NextResponse.json({ error: 'Failed to move file' }, { status: 500 })
  }
}
