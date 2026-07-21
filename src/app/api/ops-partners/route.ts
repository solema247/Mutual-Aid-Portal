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
 * GET /api/ops-partners — active ops partners for distribution decision dropdown.
 */
export async function GET() {
  try {
    const supabase = client()
    const { data, error } = await supabase
      .from('ops_partners')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching ops partners:', error)
    return NextResponse.json({ error: 'Failed to fetch ops partners' }, { status: 500 })
  }
}

/**
 * POST /api/ops-partners — add a partner if missing (grant editors).
 * Body: { name: string }
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

    const supabase = getSupabaseAdmin()

    const { data: existing } = await supabase
      .from('ops_partners')
      .select('id, name, sort_order, is_active')
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      if (!existing.is_active) {
        const { data: reactivated, error } = await supabase
          .from('ops_partners')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select('id, name, sort_order')
          .single()
        if (error) throw error
        return NextResponse.json(reactivated)
      }
      return NextResponse.json({ id: existing.id, name: existing.name, sort_order: existing.sort_order })
    }

    const { data: maxRow } = await supabase
      .from('ops_partners')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sort_order = (maxRow?.sort_order ?? 0) + 10

    const { data, error } = await supabase
      .from('ops_partners')
      .insert({ name, sort_order, is_active: true })
      .select('id, name, sort_order')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Partner already exists' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error creating ops partner:', error)
    return NextResponse.json({ error: 'Failed to create ops partner' }, { status: 500 })
  }
}
