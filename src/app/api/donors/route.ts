import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'

function client() {
  try {
    return getSupabaseRouteClient()
  } catch {
    return getSupabaseAdmin()
  }
}

/**
 * GET /api/donors — active donors for grant dropdowns.
 */
export async function GET() {
  try {
    const supabase = client()
    const { data, error } = await supabase
      .from('donors')
      .select('id, name, short_name')
      .eq('status', 'active')
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching donors:', error)
    return NextResponse.json({ error: 'Failed to fetch donors' }, { status: 500 })
  }
}

/**
 * POST /api/donors — add a donor if missing (grant editors).
 * Body: { name: string, short_name?: string }
 */
export async function POST(request: Request) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const short_name =
      typeof body.short_name === 'string' && body.short_name.trim()
        ? body.short_name.trim()
        : name

    const supabase = getSupabaseAdmin()

    const { data: existing } = await supabase
      .from('donors')
      .select('id, name, short_name, status')
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      if (existing.status !== 'active') {
        const { data: reactivated, error } = await supabase
          .from('donors')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('id, name, short_name')
          .single()
        if (error) throw error
        return NextResponse.json(reactivated)
      }
      return NextResponse.json({
        id: existing.id,
        name: existing.name,
        short_name: existing.short_name,
      })
    }

    const { data, error } = await supabase
      .from('donors')
      .insert({ name, short_name, status: 'active' })
      .select('id, name, short_name')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Donor already exists' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error creating donor:', error)
    return NextResponse.json({ error: 'Failed to create donor' }, { status: 500 })
  }
}
