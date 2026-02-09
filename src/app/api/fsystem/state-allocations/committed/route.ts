import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const allocation_id = searchParams.get('allocation_id')

    if (!allocation_id) {
      return NextResponse.json({ error: 'Missing allocation_id' }, { status: 400 })
    }

    // Get all committed projects for this allocation (funding_status = 'committed')
    const { data: committedProjects, error: committedError } = await supabase
      .from('err_projects')
      .select('*')
      .eq('grant_call_state_allocation_id', allocation_id)
      .eq('funding_status', 'committed')

    if (committedError) throw committedError
    
    console.log('Committed projects found:', committedProjects)

    // Calculate committed amount
    const committedAmount = committedProjects?.reduce((sum, project) => {
      try {
        console.log('Processing committed project expenses:', project.expenses)
        const expenses = typeof project.expenses === 'string' ? 
          JSON.parse(project.expenses) : project.expenses
        console.log('Parsed committed expenses:', expenses)
        const projectTotal = expenses.reduce((total: number, exp: { total_cost: number }) => {
          console.log('Processing committed expense:', exp, 'current total:', total)
          return total + (exp.total_cost || 0)
        }, 0)
        console.log('Committed project total:', projectTotal)
        return sum + projectTotal
      } catch (e) {
        console.error('Error parsing committed expenses:', e)
        return sum
      }
    }, 0) || 0

    // Get all allocated projects for this allocation (funding_status = 'allocated')
    const { data: allocatedProjects, error: allocatedError } = await supabase
      .from('err_projects')
      .select('*')
      .eq('grant_call_state_allocation_id', allocation_id)
      .eq('funding_status', 'allocated')

    if (allocatedError) throw allocatedError

    console.log('Allocated projects found:', allocatedProjects)

    // Calculate allocated amount
    const allocatedAmount = allocatedProjects?.reduce((sum, project) => {
      try {
        console.log('Processing allocated project expenses:', project.expenses)
        const expenses = typeof project.expenses === 'string' ? 
          JSON.parse(project.expenses) : project.expenses
        console.log('Parsed allocated expenses:', expenses)
        const projectTotal = expenses.reduce((total: number, exp: { total_cost: number }) => {
          console.log('Processing allocated expense:', exp, 'current total:', total)
          return total + (exp.total_cost || 0)
        }, 0)
        console.log('Allocated project total:', projectTotal)
        return sum + projectTotal
      } catch (e) {
        console.error('Error parsing allocated expenses:', e)
        return sum
      }
    }, 0) || 0

    // Total used amount is sum of committed and allocated
    const totalUsedAmount = committedAmount + allocatedAmount

    console.log('Final calculation summary:', {
      allocation_id,
      committed: committedAmount,
      allocated: allocatedAmount,
      total_used: totalUsedAmount
    })

    return NextResponse.json({
      committed: committedAmount,
      allocated: allocatedAmount,
      total_used: totalUsedAmount
    })
  } catch (error) {
    console.error('Error calculating committed amount:', error)
    return NextResponse.json({ error: 'Failed to calculate committed amount' }, { status: 500 })
  }
}