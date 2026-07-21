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
 * GET /api/flow-oversight-options — active flow oversight options for dropdown.
 */
export async function GET() {
  try {
    const supabase = client()
    const { data, error } = await supabase
      .from('flow_oversight_options')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching flow oversight options:', error)
    return NextResponse.json({ error: 'Failed to fetch flow oversight options' }, { status: 500 })
  }
}

/**
 * POST /api/flow-oversight-options — add an option if missing (grant editors).
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
      .from('flow_oversight_options')
      .select('id, name, sort_order, is_active')
      .ilike('name', name)
      .maybeSingle()

    if (existing) {
      if (!existing.is_active) {
        const { data: reactivated, error } = await supabase
          .from('flow_oversight_options')
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
      .from('flow_oversight_options')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const sort_order = (maxRow?.sort_order ?? 0) + 10

    const { data, error } = await supabase
      .from('flow_oversight_options')
      .insert({ name, sort_order, is_active: true })
      .select('id, name, sort_order')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Flow oversight option already exists' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('Error creating flow oversight option:', error)
    return NextResponse.json({ error: 'Failed to create flow oversight option' }, { status: 500 })
  }
}
