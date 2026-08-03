import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

type RouteContext = { params: { id: string; docId: string } }

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const projectId = params.id
    const docId = params.docId

    if (!projectId || projectId.startsWith('historical_')) {
      return NextResponse.json({ error: 'Supporting documents are only available for portal projects' }, { status: 400 })
    }
    if (!docId) {
      return NextResponse.json({ error: 'Document ID is required' }, { status: 400 })
    }

    const { data: doc, error: fetchError } = await supabase
      .from('err_project_documents')
      .select('id, project_id, file_key')
      .eq('id', docId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (fetchError) {
      console.error('[projects/documents DELETE] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })
    }
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('err_project_documents')
      .delete()
      .eq('id', docId)
      .eq('project_id', projectId)

    if (deleteError) {
      console.error('[projects/documents DELETE]', deleteError)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    if (doc.file_key) {
      try {
        await supabase.storage.from('images').remove([doc.file_key])
      } catch (e) {
        console.warn('[projects/documents DELETE] storage remove failed', doc.file_key, e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[projects/documents DELETE]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
