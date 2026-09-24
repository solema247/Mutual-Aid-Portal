import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadProjectPaymentSummaries } from '../src/lib/mouPaymentConfirmations'
import { loadReportingPaymentMaps } from '../src/lib/f4f5/paymentSummary'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

async function mapsFromSummaries(
  supabase: ReturnType<typeof createClient>,
  projectIds: string[],
  projectById: Map<string, Record<string, unknown>>,
  mouIds: string[]
) {
  const transferDateByProject: Record<string, string> = {}
  const rateByProject: Record<string, number> = {}
  const summaries = await loadProjectPaymentSummaries(supabase, { projectIds })
  for (const [projectId, summary] of Object.entries(summaries)) {
    if (!projectById.has(projectId)) continue
    if (summary.transfer_date) transferDateByProject[projectId] = summary.transfer_date
    if (summary.exchange_rate != null) rateByProject[projectId] = summary.exchange_rate
  }
  for (let i = 0; i < mouIds.length; i += 80) {
    const batch = mouIds.slice(i, i + 80)
    const { data: mousRows } = await supabase.from('mous').select('id, exchange_rate').in('id', batch)
    for (const mou of mousRows || []) {
      const mouRate = (mou as { exchange_rate?: number }).exchange_rate
      if (typeof mouRate !== 'number' || mouRate <= 0) continue
      for (const [pid, project] of projectById) {
        if (String(project.mou_id) === String((mou as { id: string }).id) && rateByProject[pid] == null) {
          rateByProject[pid] = mouRate
        }
      }
    }
  }
  return { transferDateByProject, rateByProject }
}

async function main() {
  loadEnvLocal()
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
  const { data: projects } = await supabase
    .from('err_projects')
    .select('id, mou_id')
    .in('status', ['active', 'approved', 'completed'])
    .limit(200)

  const projectById = new Map<string, Record<string, unknown>>()
  const mouIds = new Set<string>()
  for (const p of projects || []) {
    projectById.set(String(p.id), p as Record<string, unknown>)
    if (p.mou_id) mouIds.add(String(p.mou_id))
  }
  const projectIds = [...projectById.keys()]
  const mouIdList = [...mouIds]

  let t0 = Date.now()
  const legacy = await mapsFromSummaries(supabase, projectIds, projectById, mouIdList)
  const legacyMs = Date.now() - t0
  t0 = Date.now()
  const reporting = await loadReportingPaymentMaps(supabase, mouIdList, projectById)
  const reportingMs = Date.now() - t0
  console.log(`200-project timing: legacy=${legacyMs}ms reporting=${reportingMs}ms`)

  let td = 0
  let rt = 0
  for (const id of projectIds) {
    if (legacy.transferDateByProject[id] !== reporting.transferDateByProject[id]) td++
    if (legacy.rateByProject[id] !== reporting.rateByProject[id]) rt++
  }
  console.log(`200-project equivalence: transfer_date mismatches=${td}, rate mismatches=${rt}`)
}

main().catch(console.error)
