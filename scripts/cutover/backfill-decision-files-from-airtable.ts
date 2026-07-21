/**
 * Backfill missing decision File Name / File Link from Airtable Distribution_Decision
 * into distribution_decision_master_sheet_1 (and decision_documents).
 *
 * Only fills blanks — does not overwrite existing portal documents.
 *
 *   npx tsx scripts/cutover/backfill-decision-files-from-airtable.ts
 *   npx tsx scripts/cutover/backfill-decision-files-from-airtable.ts --apply
 */
import { config } from 'dotenv'
import { resolve } from 'path'
import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'
import { AIRTABLE_BASE_ID, AIRTABLE_TOKEN_ENV } from '../../src/lib/airtable/config'
import {
  buildDecisionDocument,
  normalizeDecisionDocuments,
  primaryFileFields,
} from '../../src/lib/grantManagement/decisionDocument'

config({ path: resolve(process.cwd(), '.env.local') })

const APPLY = process.argv.includes('--apply')

/** Display table Distribution_Decision */
const AT_DECISIONS_TABLE_ID = 'tblsdYJyH7SUTwVkm'

type AtDecision = {
  id: string
  decision_id_proposed: string | null
  file_name: string | null
  file_link: string | null
}

type PortalDecision = {
  id: string
  decision_id_proposed: string | null
  decision_id: string | null
  airtable_record_id: string | null
  file_name: string | null
  file_link: string | null
  decision_documents: unknown
}

function getToken(): string {
  const token = process.env[AIRTABLE_TOKEN_ENV]?.trim()
  if (!token) throw new Error(`Missing ${AIRTABLE_TOKEN_ENV} in .env.local`)
  return token
}

async function fetchAirtableDecisions(token: string): Promise<AtDecision[]> {
  const out: AtDecision[] = []
  let offset: string | undefined
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AT_DECISIONS_TABLE_ID}`)
    url.searchParams.set('pageSize', '100')
    url.searchParams.append('fields[]', 'decision_id_proposed')
    url.searchParams.append('fields[]', 'File Name')
    url.searchParams.append('fields[]', 'File Link')
    if (offset) url.searchParams.set('offset', offset)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Airtable fetch failed (${res.status}): ${text}`)
    }
    const body = (await res.json()) as {
      records: Array<{ id: string; fields: Record<string, unknown> }>
      offset?: string
    }
    for (const rec of body.records || []) {
      const proposed =
        typeof rec.fields.decision_id_proposed === 'string'
          ? rec.fields.decision_id_proposed.trim()
          : null
      const file_name =
        typeof rec.fields['File Name'] === 'string' ? rec.fields['File Name'].trim() || null : null
      const file_link =
        typeof rec.fields['File Link'] === 'string' ? rec.fields['File Link'].trim() || null : null
      out.push({ id: rec.id, decision_id_proposed: proposed, file_name, file_link })
    }
    offset = body.offset
  } while (offset)
  return out
}

function hasPortalDocs(row: PortalDecision): boolean {
  const docs = normalizeDecisionDocuments(row)
  if (docs.length > 0) return true
  return Boolean(row.file_link?.trim())
}

async function main() {
  const token = getToken()
  const supabase = getSupabaseAdmin()

  console.log(APPLY ? 'MODE: APPLY' : 'MODE: dry-run (pass --apply to write)')

  const atRows = await fetchAirtableDecisions(token)
  const atWithLink = atRows.filter((r) => r.file_link)
  console.log(`Airtable decisions: ${atRows.length} total, ${atWithLink.length} with File Link`)

  const { data: portalRows, error } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select(
      'id, decision_id_proposed, decision_id, airtable_record_id, file_name, file_link, decision_documents'
    )

  if (error) throw error
  const portal = (portalRows || []) as PortalDecision[]
  console.log(`Portal decisions: ${portal.length}`)

  const byProposed = new Map<string, PortalDecision>()
  const byAirtableId = new Map<string, PortalDecision>()
  for (const row of portal) {
    const proposed = row.decision_id_proposed?.trim()
    if (proposed) byProposed.set(proposed, row)
    const atId = row.airtable_record_id?.trim()
    if (atId) byAirtableId.set(atId, row)
  }

  let matched = 0
  let skippedHasDocs = 0
  let skippedNoPortal = 0
  let wouldUpdate = 0
  let updated = 0
  const samples: string[] = []

  for (const at of atWithLink) {
    const portalRow =
      (at.decision_id_proposed ? byProposed.get(at.decision_id_proposed) : undefined) ||
      byAirtableId.get(at.id)

    if (!portalRow) {
      skippedNoPortal++
      continue
    }
    matched++

    if (hasPortalDocs(portalRow)) {
      skippedHasDocs++
      continue
    }

    const doc = buildDecisionDocument({
      file_name: at.file_name || 'Document',
      file_link: at.file_link!,
      source: 'airtable',
    })
    const documents = [doc]
    const primary = primaryFileFields(documents)
    const label = at.decision_id_proposed || at.id

    wouldUpdate++
    if (samples.length < 10) {
      samples.push(`${label} → ${primary.file_name} | ${primary.file_link?.slice(0, 60)}…`)
    }

    if (!APPLY) continue

    const { error: upErr } = await supabase
      .from('distribution_decision_master_sheet_1')
      .update({
        file_name: primary.file_name,
        file_link: primary.file_link,
        decision_documents: documents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', portalRow.id)

    if (upErr) {
      console.error(`Failed ${label}:`, upErr.message)
      continue
    }
    updated++
  }

  console.log('\nSummary')
  console.log(`  AT with link matched to portal: ${matched}`)
  console.log(`  Skipped (portal already has docs): ${skippedHasDocs}`)
  console.log(`  Skipped (no portal row): ${skippedNoPortal}`)
  console.log(`  ${APPLY ? 'Updated' : 'Would update'}: ${APPLY ? updated : wouldUpdate}`)
  if (samples.length) {
    console.log('\nSamples:')
    for (const s of samples) console.log(`  - ${s}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
