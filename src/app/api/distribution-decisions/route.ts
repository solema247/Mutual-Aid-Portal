import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'
import { airtableMeta, syncDecisionToAirtable } from '@/lib/grantManagement/pushToAirtable'
import { SYNC_STATUS } from '@/lib/grantManagement/syncStatus'
import {
  buildDecisionDocument,
  normalizeDecisionDocuments,
  primaryFileFields,
  type DecisionDocument,
} from '@/lib/grantManagement/decisionDocument'
import {
  AD_DECISION_SERIAL_FLOOR,
  buildAdDecisionId,
  extractAdHyphenSerial,
} from '@/lib/grantManagement/adDecisionIds'

function parseIncomingDocuments(body: any): DecisionDocument[] {
  const docs: DecisionDocument[] = []

  if (Array.isArray(body.documents)) {
    for (const item of body.documents) {
      if (!item || typeof item !== 'object') continue
      const file_link = typeof item.file_link === 'string' ? item.file_link.trim() : ''
      const file_name = typeof item.file_name === 'string' ? item.file_name.trim() : ''
      if (!file_link) continue
      docs.push(
        buildDecisionDocument({
          file_name: file_name || 'Document',
          file_link,
          source: 'portal',
        })
      )
    }
  }

  // Legacy single-file create payload
  if (docs.length === 0) {
    const file_link = typeof body.file_link === 'string' ? body.file_link.trim() : ''
    const file_name = typeof body.file_name === 'string' ? body.file_name.trim() : ''
    if (file_link) {
      docs.push(
        buildDecisionDocument({
          file_name: file_name || 'Document',
          file_link,
          source: 'portal',
        })
      )
    }
  }

  return docs
}

function mapDecisionRow(row: {
  id: string
  decision_id: string | null
  decision_id_proposed: string | null
  grant_name: string | null
  restriction: string | null
  sum_allocation_amount: number | null
  decision_amount: number | null
  decision_date: string | null
  partner: string | null
  decision_maker?: string | null
  flow_oversight?: string | null
  notes?: string | null
  file_name: string | null
  file_link: string | null
  decision_documents?: unknown
}) {
  const documents = normalizeDecisionDocuments(row)
  const primary = primaryFileFields(documents)
  return {
    id: row.id,
    decision_id: row.decision_id ?? null,
    decision_id_proposed: row.decision_id_proposed ?? null,
    grant_name: row.grant_name ?? null,
    restriction: row.restriction ?? null,
    sum_allocation_amount:
      row.sum_allocation_amount != null ? Number(row.sum_allocation_amount) : null,
    decision_amount: row.decision_amount != null ? Number(row.decision_amount) : null,
    decision_date: row.decision_date ?? null,
    partner: row.partner ?? null,
    decision_maker: row.decision_maker ?? null,
    flow_oversight: row.flow_oversight ?? null,
    notes: row.notes ?? null,
    file_name: primary.file_name ?? row.file_name ?? null,
    file_link: primary.file_link ?? row.file_link ?? null,
    documents,
  }
}

const DECISION_LIST_SELECT =
  'id, decision_id_proposed, decision_id, grant_name, restriction, sum_allocation_amount, decision_amount, decision_date, partner, decision_maker, flow_oversight, notes, file_name, file_link, decision_documents'

/**
 * GET /api/distribution-decisions - List distribution decisions from canonical master sheet.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select(DECISION_LIST_SELECT)
      .order('decision_date', { ascending: false })

    if (error) throw error

    return NextResponse.json((data || []).map(mapDecisionRow))
  } catch (error) {
    console.error('Error fetching distribution decisions:', error)
    return NextResponse.json({ error: 'Failed to fetch distribution decisions' }, { status: 500 })
  }
}

/**
 * POST /api/distribution-decisions - Create a decision in canonical master sheet.
 * Supabase only; sync_status = pending (Airtable push comes later).
 */
export async function POST(request: Request) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const partner = typeof body.partner === 'string' ? body.partner.trim() || null : null
    const decision_date = typeof body.decision_date === 'string' ? body.decision_date || null : null

    if (!partner) {
      return NextResponse.json({ error: 'partner is required to generate Decision ID' }, { status: 400 })
    }
    if (!decision_date) {
      return NextResponse.json(
        { error: 'decision_date is required to generate Decision ID' },
        { status: 400 }
      )
    }

    const decision_amount =
      body.decision_amount != null ? Number(body.decision_amount) : null
    if (decision_amount == null || Number.isNaN(decision_amount) || decision_amount <= 0) {
      return NextResponse.json({ error: 'decision_amount must be a positive number' }, { status: 400 })
    }

    // Auto Decision ID: LCC.AD.{Partner}.{YY-MM-DD}-{last+1}
    const { data: existingDecisions, error: serialError } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .select('decision_id_proposed, decision_id')
    if (serialError) throw serialError

    let maxSerial = AD_DECISION_SERIAL_FLOOR
    for (const row of existingDecisions || []) {
      for (const id of [row.decision_id_proposed, row.decision_id]) {
        const n = extractAdHyphenSerial(id)
        if (n != null && n > maxSerial) maxSerial = n
      }
    }
    const nextSerial = maxSerial + 1
    const decision_id_proposed = buildAdDecisionId(partner, decision_date, nextSerial)
    const decision_id = decision_id_proposed

    const documents = parseIncomingDocuments(body)
    const primary = primaryFileFields(documents)

    const row = {
      decision_id_proposed,
      decision_id,
      decision_amount,
      decision_date,
      partner,
      decision_maker:
        typeof body.decision_maker === 'string' ? body.decision_maker.trim() || null : null,
      flow_oversight:
        typeof body.flow_oversight === 'string' ? body.flow_oversight.trim() || null : null,
      restriction: typeof body.restriction === 'string' ? body.restriction.trim() || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      grant_name: typeof body.grant_name === 'string' ? body.grant_name.trim() || null : null,
      file_name: primary.file_name,
      file_link: primary.file_link,
      decision_documents: documents,
      sum_allocation_amount: 0,
      sync_status: SYNC_STATUS.PENDING,
    }

    const { data, error } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .insert(row)
      .select(DECISION_LIST_SELECT)
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Decision ID already exists' }, { status: 409 })
      }
      throw error
    }

    const push = await syncDecisionToAirtable(auth.ctx.supabase, data.id)

    return NextResponse.json(
      {
        ...mapDecisionRow(data),
        ...airtableMeta(push),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating distribution decision:', error)
    const message = error instanceof Error ? error.message : 'Failed to create distribution decision'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
