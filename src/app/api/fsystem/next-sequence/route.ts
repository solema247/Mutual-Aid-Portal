import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(req: Request) {
  try {
    const { base_pattern, preview_only = false } = await req.json()

    if (!base_pattern) {
      return NextResponse.json({ error: 'base_pattern is required' }, { status: 400 })
    }

    // Get existing pattern to determine next number
    const { data: existingPattern, error: getError } = await supabase
      .from('grant_ids')
      .select('id, last_sequence_number')
      .eq('base_pattern', base_pattern)
      .single()

    if (getError && getError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw getError
    }

    const nextNumber = existingPattern ? existingPattern.last_sequence_number + 1 : 1
    const paddedNumber = String(nextNumber).padStart(3, '0')

    // If preview only, just return the next number without saving
    if (preview_only) {
      return NextResponse.json({
        sequence_number: nextNumber,
        padded_number: paddedNumber
      })
    }

    // Otherwise, update or insert the new sequence
    if (existingPattern) {
      const { error: updateError } = await supabase
        .from('grant_ids')
        .update({ 
          last_sequence_number: nextNumber,
          last_used: new Date().toISOString()
        })
        .eq('id', existingPattern.id)

      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabase
        .from('grant_ids')
        .insert([{
          base_pattern,
          last_sequence_number: nextNumber,
          last_used: new Date().toISOString()
        }])

      if (insertError) throw insertError
    }

    return NextResponse.json({
      sequence_number: nextNumber,
      padded_number: paddedNumber
    })

  } catch (error) {
    console.error('Error generating next sequence:', error)
    return NextResponse.json({ 
      error: 'Failed to generate next sequence number',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 