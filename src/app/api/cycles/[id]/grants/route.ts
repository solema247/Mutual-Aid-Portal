import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/cycles/[id]/grants - Get grants included in a cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { data, error } = await supabase
      .from('cycle_grant_inclusions')
      .select(`
        id,
        amount_included,
        grant_calls (
          id,
          name,
          shortname,
          amount,
          status,
          donor:donors (
            id,
            name,
            short_name
          )
        )
      `)
      .eq('cycle_id', params.id)

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching cycle grants:', error)
    return NextResponse.json({ error: 'Failed to fetch cycle grants' }, { status: 500 })
  }
}

// POST /api/cycles/[id]/grants - Add grants to a cycle
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { grant_inclusions } = body

    if (!grant_inclusions || !Array.isArray(grant_inclusions)) {
      return NextResponse.json({ error: 'Invalid grant inclusions data' }, { status: 400 })
    }

    // Prepare inclusions data
    const inclusions = grant_inclusions.map((inclusion: any) => ({
      cycle_id: params.id,
      grant_call_id: inclusion.grant_call_id,
      amount_included: inclusion.amount_included
    }))

    const { data, error } = await supabase
      .from('cycle_grant_inclusions')
      .insert(inclusions)
      .select()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error adding grants to cycle:', error)
    return NextResponse.json({ error: 'Failed to add grants to cycle' }, { status: 500 })
  }
}

// DELETE /api/cycles/[id]/grants/[grantId] - Remove grant from cycle
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; grantId: string } }
) {
  try {
    const { error } = await supabase
      .from('cycle_grant_inclusions')
      .delete()
      .eq('cycle_id', params.id)
      .eq('grant_call_id', params.grantId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error removing grant from cycle:', error)
    return NextResponse.json({ error: 'Failed to remove grant from cycle' }, { status: 500 })
  }
}
