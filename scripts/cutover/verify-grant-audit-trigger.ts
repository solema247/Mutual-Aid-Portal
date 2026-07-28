import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase credentials')

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const decisionId = '00000000-0000-4000-8000-0000000000a1'
  const proposed = 'LCC.AUDIT.TEST.DELETE-ME'
  const allocId = 'LCC.AD.AUDIT.TEST.DELETE-ME'

  // Cleanup any leftover from a prior failed run
  await supabase.from('allocations_by_date').delete().eq('Allocation_ID', allocId)
  await supabase.from('distribution_decision_master_sheet_1').delete().eq('id', decisionId)

  const { error: e1 } = await supabase.from('distribution_decision_master_sheet_1').insert({
    id: decisionId,
    decision_id_proposed: proposed,
    decision_id: proposed,
    partner: 'P2H',
    decision_amount: 1,
    sum_allocation_amount: 1,
    decision_date: '2099-01-01',
    restriction: 'Flexible',
    sync_status: 'legacy',
    decision_documents: [],
  })
  if (e1) throw new Error('insert decision: ' + e1.message)
  console.log('inserted decision')

  const { error: e2 } = await supabase.from('allocations_by_date').insert({
    Allocation_ID: allocId,
    Decision_ID: proposed,
    State: 'Khartoum',
    'Allocation Amount': 1,
    Decision_Amount: 1,
    Decision_Date: '2099-01-01',
    Partner: 'P2H',
    sync_status: 'legacy',
  })
  if (e2) throw new Error('insert allocation: ' + e2.message)
  console.log('inserted allocation')

  const { error: e3 } = await supabase
    .from('distribution_decision_master_sheet_1')
    .delete()
    .eq('id', decisionId)
  if (e3) throw new Error('delete decision: ' + e3.message)
  console.log('deleted decision (cascade alloc)')

  const { data: audit, error: e4 } = await supabase
    .from('grant_table_audit')
    .select('table_name, action, row_pk, db_role')
    .in('row_pk', [decisionId, allocId])
    .order('id')
  if (e4) throw new Error('read audit: ' + e4.message)
  console.log('audit rows:', JSON.stringify(audit, null, 2))

  const { count: d } = await supabase
    .from('distribution_decision_master_sheet_1')
    .select('*', { count: 'exact', head: true })
  const { count: a } = await supabase
    .from('allocations_by_date')
    .select('*', { count: 'exact', head: true })
  console.log(`counts decisions=${d} allocations=${a}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
