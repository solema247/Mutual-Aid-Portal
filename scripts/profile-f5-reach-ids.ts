/**
 * Read-only: compare legacy vs Path A reach report ID counts (admin-like scope).
 * Usage: npx tsx scripts/profile-f5-reach-ids.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { chunkIds } from '../src/lib/f4f5/listCommon'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

async function main() {
  loadEnvLocal()
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

  const { data: projects } = await supabase
    .from('err_projects')
    .select('id')
    .in('status', ['active', 'approved', 'completed'])
  const projectById = new Set((projects || []).map((p) => String(p.id)))

  const { data: reports } = await supabase
    .from('err_program_report')
    .select('id, project_id')
  const allReportIds = (reports || []).map((r) => String(r.id))
  const inScopeReportIds: string[] = []
  for (const r of reports || []) {
    const pid = r.project_id ? String(r.project_id) : ''
    if (pid && projectById.has(pid)) inScopeReportIds.push(String(r.id))
  }

  console.log(`Legacy reach ID count (all fetched reports): ${allReportIds.length}`)
  console.log(`In-scope uploaded report IDs (candidate rows): ${inScopeReportIds.length}`)
  console.log(`Path A default page (pageSize=20 uploaded max): <= 20`)

  const pageSize = 20
  const sample = inScopeReportIds.slice(0, pageSize)
  const t0 = Date.now()
  let rowCount = 0
  for (const batch of chunkIds(sample)) {
    const { data } = await supabase.from('err_program_reach').select('report_id, end_date').in('report_id', batch)
    rowCount += data?.length ?? 0
  }
  console.log(`Reach rows fetched for ${sample.length} report IDs: ${rowCount} (${Date.now() - t0}ms)`)

  const t1 = Date.now()
  let rowCountAll = 0
  for (const batch of chunkIds(inScopeReportIds)) {
    const { data } = await supabase.from('err_program_reach').select('report_id, end_date').in('report_id', batch)
    rowCountAll += data?.length ?? 0
  }
  console.log(`Reach rows fetched for all in-scope report IDs: ${rowCountAll} (${Date.now() - t1}ms)`)
}

main().catch(console.error)
