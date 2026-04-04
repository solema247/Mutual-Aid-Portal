import type OpenAI from 'openai'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// ─── Tool definitions for OpenAI function calling ────────────────────────────

export const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_portal_overview',
      description:
        'Returns high-level KPIs for the whole portal: total projects, total planned USD, ' +
        'total actual spend, burn rate, F4/F5 report counts, and beneficiaries reached. ' +
        'Use this to answer questions like "how many projects are there?", "what is the total spend?", ' +
        '"how many people have been reached?", "what is the overall burn rate?".',
      parameters: {
        type: 'object',
        properties: {
          status_filter: {
            type: 'string',
            enum: ['all', 'active', 'completed', 'overdue'],
            description: 'Filter projects by status. Defaults to "all".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_projects_by_state',
      description:
        'Returns a breakdown of projects, planned budget, actual spend, and F4/F5 status ' +
        'grouped by Sudanese state. Use this for questions about specific states, geographic ' +
        'distribution, or comparing states.',
      parameters: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
            description: 'Optional: filter to a specific state name (English).',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_reporting_status',
      description:
        'Returns F4 and F5 reporting completion rates: how many projects have submitted ' +
        'financial reports (F4) and programme reports (F5), broken down by status. ' +
        'Use this for questions about reporting compliance, overdue reports, or submission rates.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue_projects',
      description:
        'Returns the list of projects that are overdue (past 32-day reporting deadline ' +
        'with incomplete F4 or F5). Includes state, ERR code, days overdue, and transfer date.',
      parameters: {
        type: 'object',
        properties: {
          state: {
            type: 'string',
            description: 'Optional: filter to a specific state.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_grant_financials',
      description:
        'Returns financial summary per grant: transferred amount, transfer fees, activity spend, ' +
        'and remaining balance. Use this for questions about specific grants or grant-level financials.',
      parameters: {
        type: 'object',
        properties: {
          grant_id: {
            type: 'string',
            description: 'Optional: filter to a specific grant ID.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_forecast_summary',
      description:
        'Returns monthly forecast data showing how much funding is planned vs confirmed ' +
        'by month. Use this for questions about future funding projections or monthly pipeline.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_activity',
      description:
        'Returns recently submitted F4 financial reports and F5 programme reports ' +
        'across all projects, ordered by most recent first. Use this for questions about ' +
        '"what has been submitted recently" or "latest reports".',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max number of records to return (default 10, max 20).',
          },
        },
        required: [],
      },
    },
  },
]

// ─── Tool executors ───────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>

export async function executeTool(name: string, args: ToolArgs): Promise<unknown> {
  const supabase = getSupabaseAdmin()

  switch (name) {
    case 'get_portal_overview': {
      // Count portal projects (approved/active/completed with committed/allocated funding)
      const { count: totalProjects } = await supabase
        .from('err_projects')
        .select('*', { count: 'exact', head: true })
        .in('status', ['approved', 'active', 'pending', 'completed'])
        .in('funding_status', ['committed', 'allocated'])

      // Count active (not yet completed) portal projects
      const { count: activeProjects } = await supabase
        .from('err_projects')
        .select('*', { count: 'exact', head: true })
        .in('status', ['approved', 'active', 'pending'])
        .in('funding_status', ['committed', 'allocated'])

      // Count historical projects
      const { count: historicalProjects } = await supabase
        .from('activities_raw_import')
        .select('*', { count: 'exact', head: true })

      // Total actual spend from F4 reports (portal projects only)
      const { data: summaries } = await supabase
        .from('err_summary')
        .select('total_expenses')
        .is('activities_raw_import_id', null)
        .not('project_id', 'is', null)

      const totalActual = (summaries || []).reduce(
        (sum, r) => sum + (Number(r.total_expenses) || 0),
        0
      )

      // F4 count (portal)
      const { count: f4Count } = await supabase
        .from('err_summary')
        .select('*', { count: 'exact', head: true })
        .is('activities_raw_import_id', null)
        .not('project_id', 'is', null)

      // F5 count (portal)
      const { count: f5Count } = await supabase
        .from('err_program_report')
        .select('*', { count: 'exact', head: true })

      // Beneficiaries reached from F5 programme reports
      const { data: reach } = await supabase
        .from('err_program_reach')
        .select('individual_count, household_count')

      const totalIndividuals = (reach || []).reduce(
        (sum, r) => sum + (Number(r.individual_count) || 0),
        0
      )
      const totalFamilies = (reach || []).reduce(
        (sum, r) => sum + (Number(r.household_count) || 0),
        0
      )

      // Unique states
      const { data: stateRows } = await supabase
        .from('err_projects')
        .select('state')
        .in('status', ['approved', 'active', 'pending', 'completed'])
        .in('funding_status', ['committed', 'allocated'])
        .not('state', 'is', null)

      const uniqueStates = [...new Set((stateRows || []).map((r) => r.state).filter(Boolean))]

      return {
        portal_projects: totalProjects ?? 0,
        active_portal_projects: activeProjects ?? 0,
        historical_projects: historicalProjects ?? 0,
        total_projects_all_time: (totalProjects ?? 0) + (historicalProjects ?? 0),
        states_covered: uniqueStates.length,
        states: uniqueStates.sort(),
        total_actual_spend_usd: Math.round(totalActual),
        f4_reports_submitted: f4Count ?? 0,
        f5_reports_submitted: f5Count ?? 0,
        individuals_reached: totalIndividuals,
        families_reached: totalFamilies,
      }
    }

    case 'get_projects_by_state': {
      const stateFilter = args.state as string | undefined

      let query = supabase
        .from('err_projects')
        .select('state, status, f4_status, f5_status, funding_status')
        .in('status', ['approved', 'active', 'pending', 'completed'])
        .in('funding_status', ['committed', 'allocated'])

      if (stateFilter) {
        query = query.ilike('state', `%${stateFilter}%`)
      }

      const { data: projects } = await query

      // Group by state
      const byState = new Map<
        string,
        { total: number; active: number; completed: number; f4_done: number; f5_done: number }
      >()

      for (const p of projects || []) {
        const state = p.state || 'Unknown'
        const prev = byState.get(state) ?? {
          total: 0,
          active: 0,
          completed: 0,
          f4_done: 0,
          f5_done: 0,
        }
        prev.total += 1
        if (p.status === 'completed') prev.completed += 1
        else prev.active += 1
        if (['completed', 'in review', 'under review', 'partial'].includes(
          (p.f4_status || '').toLowerCase()
        )) prev.f4_done += 1
        if (['completed', 'in review', 'under review'].includes(
          (p.f5_status || '').toLowerCase()
        )) prev.f5_done += 1
        byState.set(state, prev)
      }

      const result = Array.from(byState.entries())
        .map(([state, data]) => ({ state, ...data }))
        .sort((a, b) => b.total - a.total)

      return { states: result, total_states: result.length }
    }

    case 'get_reporting_status': {
      // F4 status breakdown
      const { data: f4Projects } = await supabase
        .from('err_projects')
        .select('f4_status, id')
        .in('status', ['approved', 'active', 'pending', 'completed'])
        .in('funding_status', ['committed', 'allocated'])

      const f4StatusCounts: Record<string, number> = {}
      for (const p of f4Projects || []) {
        const s = (p.f4_status || 'waiting').toLowerCase()
        f4StatusCounts[s] = (f4StatusCounts[s] || 0) + 1
      }

      // F5 status breakdown
      const { data: f5Projects } = await supabase
        .from('err_projects')
        .select('f5_status')
        .in('status', ['approved', 'active', 'pending', 'completed'])
        .in('funding_status', ['committed', 'allocated'])

      const f5StatusCounts: Record<string, number> = {}
      for (const p of f5Projects || []) {
        const s = (p.f5_status || 'waiting').toLowerCase()
        f5StatusCounts[s] = (f5StatusCounts[s] || 0) + 1
      }

      const total = f4Projects?.length ?? 0
      const f4Completed = (f4StatusCounts['completed'] || 0) +
        (f4StatusCounts['in review'] || 0) +
        (f4StatusCounts['under review'] || 0)
      const f5Completed = (f5StatusCounts['completed'] || 0) +
        (f5StatusCounts['in review'] || 0) +
        (f5StatusCounts['under review'] || 0)

      return {
        total_projects: total,
        f4: {
          status_breakdown: f4StatusCounts,
          submitted_or_reviewed: f4Completed,
          waiting: f4StatusCounts['waiting'] || 0,
          completion_rate_pct: total > 0 ? Math.round((f4Completed / total) * 100) : 0,
        },
        f5: {
          status_breakdown: f5StatusCounts,
          submitted_or_reviewed: f5Completed,
          waiting: f5StatusCounts['waiting'] || 0,
          completion_rate_pct: total > 0 ? Math.round((f5Completed / total) * 100) : 0,
        },
      }
    }

    case 'get_overdue_projects': {
      const stateFilter = args.state as string | undefined

      let query = supabase
        .from('err_projects')
        .select(
          'id, state, f4_status, f5_status, date_transfer, emergency_rooms(err_code, name)'
        )
        .in('status', ['approved', 'active', 'pending'])
        .in('funding_status', ['committed', 'allocated'])
        .not('date_transfer', 'is', null)

      if (stateFilter) {
        query = query.ilike('state', `%${stateFilter}%`)
      }

      const { data: projects } = await query

      const OVERDUE_DAYS = 32
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const overdueProjects = (projects || [])
        .map((p) => {
          if (!p.date_transfer) return null
          const due = new Date(p.date_transfer)
          due.setDate(due.getDate() + OVERDUE_DAYS)
          due.setHours(0, 0, 0, 0)
          if (due >= today) return null

          const f4Done = ['completed', 'in review', 'under review', 'partial'].includes(
            (p.f4_status || '').toLowerCase()
          )
          const f5Done = ['completed', 'in review', 'under review'].includes(
            (p.f5_status || '').toLowerCase()
          )
          if (f4Done && f5Done) return null

          const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
          const room = Array.isArray(p.emergency_rooms) ? p.emergency_rooms[0] : p.emergency_rooms

          return {
            project_id: p.id,
            state: p.state,
            err_code: room?.err_code || null,
            err_name: room?.name || null,
            transfer_date: p.date_transfer,
            days_overdue: daysOverdue,
            f4_status: p.f4_status || 'waiting',
            f5_status: p.f5_status || 'waiting',
            missing: [!f4Done && 'F4', !f5Done && 'F5'].filter(Boolean),
          }
        })
        .filter(Boolean)
        .sort((a, b) => (b?.days_overdue ?? 0) - (a?.days_overdue ?? 0))

      return {
        overdue_count: overdueProjects.length,
        projects: overdueProjects.slice(0, 20),
      }
    }

    case 'get_grant_financials': {
      const grantIdFilter = args.grant_id as string | undefined

      let query = supabase
        .from('grants')
        .select(
          'grant_id, total_transferred_amount_usd, sum_transfer_fee_amount, sum_activity_amount'
        )
        .order('grant_id', { ascending: true })

      if (grantIdFilter) {
        query = query.ilike('grant_id', `%${grantIdFilter}%`)
      }

      const { data: grants } = await query

      const result = (grants || []).map((g) => {
        const total = Number(g.total_transferred_amount_usd) || 0
        const fee = Number(g.sum_transfer_fee_amount) || 0
        const activity = Number(g.sum_activity_amount) || 0
        return {
          grant_id: g.grant_id,
          transferred_usd: Math.round(total),
          transfer_fees_usd: Math.round(fee),
          activity_spend_usd: Math.round(activity),
          remaining_balance_usd: Math.round(Math.max(0, total - fee - activity)),
          burn_rate_pct: total > 0 ? Math.round(((fee + activity) / total) * 100) : 0,
        }
      })

      const totalTransferred = result.reduce((s, r) => s + r.transferred_usd, 0)
      const totalSpent = result.reduce((s, r) => s + r.transfer_fees_usd + r.activity_spend_usd, 0)
      const totalBalance = result.reduce((s, r) => s + r.remaining_balance_usd, 0)

      return {
        grants: result,
        totals: {
          total_transferred_usd: totalTransferred,
          total_spent_usd: totalSpent,
          total_remaining_usd: totalBalance,
          overall_burn_rate_pct:
            totalTransferred > 0 ? Math.round((totalSpent / totalTransferred) * 100) : 0,
        },
      }
    }

    case 'get_forecast_summary': {
      const { data, error } = await supabase.rpc('get_forecast_summary')

      if (error) {
        return { error: 'Could not load forecast data', details: error.message }
      }

      // Aggregate by month
      type ForecastRow = { month: string | null; status: string | null; amount: number | null }
      const rows = (Array.isArray(data) ? data : []) as ForecastRow[]
      const byMonth = new Map<string, Record<string, number>>()

      for (const row of rows) {
        const month = (row.month || '').slice(0, 7)
        if (!month) continue
        const status = (row.status || 'unknown').toLowerCase()
        const amount = Number(row.amount) || 0
        if (!byMonth.has(month)) byMonth.set(month, {})
        const m = byMonth.get(month)!
        m[status] = (m[status] || 0) + amount
      }

      const sortedMonths = Array.from(byMonth.keys()).sort()
      const summary = sortedMonths.map((month) => ({
        month,
        ...byMonth.get(month),
      }))

      return { monthly_forecast: summary, months_count: summary.length }
    }

    case 'get_recent_activity': {
      const limit = Math.min(Number(args.limit) || 10, 20)

      const [{ data: f4Reports }, { data: f5Reports }] = await Promise.all([
        supabase
          .from('err_summary')
          .select(
            'id, project_id, report_date, total_expenses, created_at'
          )
          .is('activities_raw_import_id', null)
          .order('created_at', { ascending: false })
          .limit(limit),
        supabase
          .from('err_program_report')
          .select('id, project_id, report_date, reporting_person, created_at')
          .order('created_at', { ascending: false })
          .limit(limit),
      ])

      return {
        recent_f4_reports: (f4Reports || []).map((r) => ({
          project_id: r.project_id,
          report_date: r.report_date,
          total_expenses_usd: Math.round(Number(r.total_expenses) || 0),
          submitted_at: r.created_at,
        })),
        recent_f5_reports: (f5Reports || []).map((r) => ({
          project_id: r.project_id,
          report_date: r.report_date,
          reporting_person: r.reporting_person,
          submitted_at: r.created_at,
        })),
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}
