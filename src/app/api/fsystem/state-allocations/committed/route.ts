import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const allocation_id = searchParams.get('allocation_id')

  if (!allocation_id) {
    return NextResponse.json({ error: 'Missing allocation_id' }, { status: 400 })
  }

  try {
    // Get all pending projects for this allocation
    const { data: pendingProjects, error: pendingError } = await supabase
      .from('err_projects')
      .select('*')
      .eq('grant_call_state_allocation_id', allocation_id)
      .eq('status', 'pending')

    if (pendingError) throw pendingError
    
    console.log('Pending projects found:', pendingProjects)

    // Calculate pending amount
    const pendingAmount = pendingProjects?.reduce((sum, project) => {
      try {
        console.log('Processing project expenses:', project.expenses)
        const expenses = typeof project.expenses === 'string' ? 
          JSON.parse(project.expenses) : project.expenses
        console.log('Parsed expenses:', expenses)
        const projectTotal = expenses.reduce((total: number, exp: { total_cost: number }) => {
          console.log('Processing expense:', exp, 'current total:', total)
          return total + (exp.total_cost || 0)
        }, 0)
        console.log('Project total:', projectTotal)
        return sum + projectTotal
      } catch (e) {
        console.error('Error parsing expenses:', e)
        return sum
      }
    }, 0) || 0

    // Get all approved projects for this allocation
    const { data: approvedProjects, error: approvedError } = await supabase
      .from('err_projects')
      .select('*')
      .eq('grant_call_state_allocation_id', allocation_id)
      .eq('status', 'approved')

    if (approvedError) throw approvedError

    console.log('Approved projects found:', approvedProjects)

    // Calculate approved amount
    const approvedAmount = approvedProjects?.reduce((sum, project) => {
      try {
        console.log('Processing approved project expenses:', project.expenses)
        const expenses = typeof project.expenses === 'string' ? 
          JSON.parse(project.expenses) : project.expenses
        console.log('Parsed approved expenses:', expenses)
        const projectTotal = expenses.reduce((total: number, exp: { total_cost: number }) => {
          console.log('Processing approved expense:', exp, 'current total:', total)
          return total + (exp.total_cost || 0)
        }, 0)
        console.log('Approved project total:', projectTotal)
        return sum + projectTotal
      } catch (e) {
        console.error('Error parsing approved expenses:', e)
        return sum
      }
    }, 0) || 0

    // Total committed is sum of pending and approved
    const committedAmount = pendingAmount + approvedAmount

    return NextResponse.json({
      committed: committedAmount,
      pending: pendingAmount,
      approved: approvedAmount
    })
  } catch (error) {
    console.error('Error calculating committed amount:', error)
    return NextResponse.json({ error: 'Failed to calculate committed amount' }, { status: 500 })
  }
}