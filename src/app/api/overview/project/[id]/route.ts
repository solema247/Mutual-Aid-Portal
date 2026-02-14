import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { userCanAccessState } from '@/lib/userStateAccess'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const id = params.id
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    // Check if this is a historical project
    const isHistorical = id.startsWith('historical_')
    const actualId = isHistorical ? id.replace('historical_', '') : id

    if (isHistorical) {
      // Load historical project from activities_raw_import
      const { data: historicalProject, error: histErr } = await supabase
        .from('activities_raw_import')
        .select('*')
        .eq('id', actualId)
        .single()
      
      if (histErr) throw histErr
      if (!historicalProject) {
        return NextResponse.json({ error: 'Historical project not found' }, { status: 404 })
      }
      const histState = historicalProject['State'] || historicalProject['state'] || null
      const canAccessHist = await userCanAccessState(histState)
      if (!canAccessHist) {
        return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 })
      }

      // Fetch F4 summaries for this historical project
      const { data: historicalSummaries } = await supabase
        .from('err_summary')
        .select(`
          id,
          report_date,
          total_grant,
          total_expenses,
          total_expenses_sdg,
          remainder,
          beneficiaries,
          lessons,
          training,
          project_objectives,
          created_at
        `)
        .eq('activities_raw_import_id', actualId)
        .order('created_at', { ascending: false })

      // Fetch expenses for each summary
      const summaryIds = (historicalSummaries || []).map((s: any) => s.id)
      let summariesWithExpenses: any[] = []
      if (summaryIds.length > 0) {
        const { data: expenses } = await supabase
          .from('err_expense')
          .select('*')
          .in('summary_id', summaryIds)
        
        // Group expenses by summary_id
        const expensesBySummary: Record<number, any[]> = {}
        ;(expenses || []).forEach((e: any) => {
          if (e.summary_id) {
            if (!expensesBySummary[e.summary_id]) {
              expensesBySummary[e.summary_id] = []
            }
            expensesBySummary[e.summary_id].push(e)
          }
        })

        // Attach expenses to summaries
        summariesWithExpenses = (historicalSummaries || []).map((s: any) => ({
          ...s,
          expenses: expensesBySummary[s.id] || []
        }))
      } else {
        summariesWithExpenses = historicalSummaries || []
      }

      // Fetch F4 file attachments for historical projects
      const f4FileAttachments: any[] = []
      if (summaryIds.length > 0) {
        const { data: f4Attachments } = await supabase
          .from('err_summary_attachments')
          .select('summary_id, file_key, file_type')
          .in('summary_id', summaryIds)
        if (f4Attachments) {
          f4FileAttachments.push(...f4Attachments)
        }
      }

      // Map historical project to match the expected structure
      const project = {
        id: id,
        is_historical: true,
        state: historicalProject['State'] || historicalProject['state'] || null,
        locality: null,
        status: historicalProject['Project Status'] || historicalProject['project_status'] || null,
        project_objectives: historicalProject['Description of ERRs activity'] || historicalProject['description_of_errs_activity'] || null,
        intended_beneficiaries: historicalProject['Target (Ind.)'] || historicalProject['target_ind'] ? 
          `Individuals: ${historicalProject['Target (Ind.)'] || historicalProject['target_ind']}\nFamilies: ${historicalProject['Target (Fam.)'] || historicalProject['target_fam'] || 'N/A'}` : null,
        estimated_beneficiaries: historicalProject['Target (Ind.)'] || historicalProject['target_ind'] || null,
        estimated_timeframe: historicalProject['Activity Duration'] || historicalProject['activity_duration'] || null,
        additional_support: null,
        expenses: null,
        planned_activities: null,
        grant_call_id: null,
        emergency_room_id: null,
        emergency_rooms: {
          id: null,
          name: historicalProject['ERR Name'] || historicalProject['err_name'] || null,
          name_ar: null,
          err_code: historicalProject['ERR CODE'] || historicalProject['err_code'] || null
        },
        // Additional historical fields
        serial_number: historicalProject['Serial Number'] || historicalProject['serial_number'] || null,
        project_donor: historicalProject['Project Donor'] || historicalProject['project_donor'] || null,
        partner: historicalProject['Partner'] || historicalProject['partner'] || null,
        responsible: historicalProject['Responsible'] || historicalProject['responsible'] || null,
        sector_primary: historicalProject['Sector (Primary)'] || historicalProject['sector_primary'] || null,
        sector_secondary: historicalProject['Sector (Secondardy'] || historicalProject['sector_secondary'] || null,
        f1_date_submitted: historicalProject['F1 Date of Submitted'] || historicalProject['f1_date_of_submitted'] || null,
        f1_status: historicalProject['F1'] || historicalProject['f1'] || null,
        overdue: historicalProject['Overdue'] || historicalProject['overdue'] || null,
        mou_signed: historicalProject['MOU Signed'] || historicalProject['mou_signed'] || null,
        date_transfer: historicalProject['Date Transfer'] || historicalProject['date_transfer'] || null,
        usd: historicalProject['USD'] || historicalProject['usd'] || null,
        sdg: historicalProject['SDG'] || historicalProject['sdg'] || null,
        rate: historicalProject['Rate'] || historicalProject['rate'] || null,
        start_date_activity: historicalProject['Start Date (Activity)'] || historicalProject['start_date_activity'] || null,
        end_date_activity: historicalProject['End Date (Activity)'] || historicalProject['end_date_activity'] || null,
        f4_status: historicalProject['F4'] || historicalProject['f4'] || null,
        f5_status: historicalProject['F5'] || historicalProject['f5'] || null,
        date_report_completed: historicalProject['Date Report Completed'] || historicalProject['date_report_completed'] || null,
        reporting_duration: historicalProject['Reporting Duration (End Date to Report)'] || historicalProject['reporting_duration'] || null,
        tracker: historicalProject['Tracker'] || historicalProject['tracker'] || null,
        volunteers: historicalProject['Volunteers'] || historicalProject['volunteers'] || null,
        family: historicalProject['Family'] || historicalProject['family'] || null,
        individuals: historicalProject['Individuals'] || historicalProject['individuals'] || null,
        male_over_18: historicalProject['Male >18'] || historicalProject['male_over_18'] || null,
        female_over_18: historicalProject['Female >18'] || historicalProject['female_over_18'] || null,
        male_under_18: historicalProject['Male <18'] || historicalProject['male_under_18'] || null,
        female_under_18: historicalProject['Female <18'] || historicalProject['female_under_18'] || null,
        people_with_special_needs: historicalProject['People with special needs'] || historicalProject['people_with_special_needs'] || null,
        lessons_learned: historicalProject['Lessons learned'] || historicalProject['lessons_learned'] || null,
        challenges: historicalProject['Challenges'] || historicalProject['challenges'] || null,
        recommendations: historicalProject['Recommendations'] || historicalProject['recommendations'] || null,
        comments: historicalProject['Comments'] || historicalProject['comments'] || null,
        grant_segment: historicalProject['Grant Segment'] || historicalProject['grant_segment'] || null
      }

      // Return historical project with F4 summaries and files
      return NextResponse.json({ 
        project, 
        summaries: summariesWithExpenses,
        f5Reports: [],
        is_historical: true,
        file_keys: {},
        f4_files: f4FileAttachments,
        f5_files: []
      })
    } else {
      // Load F1 project (err_projects)
      const { data: project, error: projErr } = await supabase
        .from('err_projects')
        .select(`
          id,
          date,
          state,
          locality,
          status,
          project_objectives,
          intended_beneficiaries,
          estimated_beneficiaries,
          estimated_timeframe,
          additional_support,
          expenses,
          planned_activities,
          grant_call_id,
          emergency_room_id,
          file_key,
          approval_file_key,
          mou_id,
          emergency_rooms ( id, name, name_ar, err_code )
        `)
        .eq('id', id)
        .single()
      if (projErr) throw projErr
      const canAccess = await userCanAccessState((project as any)?.state)
      if (!canAccess) {
        return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 })
      }

      // Load MOU file keys if mou_id exists
      let mouFileKeys: { payment_confirmation_file: string | null; signed_mou_file_key: string | null } | null = null
      if (project.mou_id) {
        const { data: mou, error: mouErr } = await supabase
          .from('mous')
          .select('payment_confirmation_file, signed_mou_file_key')
          .eq('id', project.mou_id)
          .single()
        if (!mouErr && mou) {
          mouFileKeys = {
            payment_confirmation_file: mou.payment_confirmation_file || null,
            signed_mou_file_key: mou.signed_mou_file_key || null
          }
        }
      }

      // Load F4 summaries for this project
      const { data: summaries, error: sumErr } = await supabase
        .from('err_summary')
        .select('id, report_date, total_grant, total_expenses, remainder, lessons, training, excess_expenses, surplus_use, created_at')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
      if (sumErr) throw sumErr

      const summaryIds = (summaries || []).map((s: any) => s.id)
      let expensesBySummary: Record<number, any[]> = {}
      if (summaryIds.length) {
        const { data: expenses } = await supabase
          .from('err_expense')
          .select('expense_id, summary_id, expense_activity, expense_description, expense_amount, payment_date, payment_method, receipt_no, seller')
          .in('summary_id', summaryIds as any)
        for (const e of (expenses || [])) {
          const sid = (e as any).summary_id
          expensesBySummary[sid] = expensesBySummary[sid] || []
          expensesBySummary[sid].push(e)
        }
      }

      const summariesWithExpenses = (summaries || []).map((s: any) => ({
        ...s,
        expenses: expensesBySummary[s.id] || []
      }))

      // Load F5 reports for this project
      const { data: f5Reports, error: f5Err } = await supabase
        .from('err_program_report')
        .select('id, report_date, positive_changes, negative_results, unexpected_results, lessons_learned, suggestions, reporting_person, created_at, is_draft')
        .eq('project_id', id)
        .order('created_at', { ascending: false })
      if (f5Err) throw f5Err

      const reportIds = (f5Reports || []).map((r: any) => r.id)
      let reachByReport: Record<string, any[]> = {}
      if (reportIds.length) {
        const { data: reach } = await supabase
          .from('err_program_reach')
          .select('*')
          .in('report_id', reportIds)
        for (const r of (reach || [])) {
          const rid = (r as any).report_id
          reachByReport[rid] = reachByReport[rid] || []
          reachByReport[rid].push(r)
        }
      }

      const f5ReportsWithReach = (f5Reports || []).map((r: any) => ({
        ...r,
        reach: reachByReport[r.id] || []
      }))

      // Load F4 file attachments
      const f4FileAttachments: any[] = []
      if (summaryIds.length) {
        const { data: f4Attachments } = await supabase
          .from('err_summary_attachments')
          .select('summary_id, file_key, file_type')
          .in('summary_id', summaryIds as any)
        if (f4Attachments) {
          f4FileAttachments.push(...f4Attachments)
        }
      }

      // Load F5 file attachments
      const f5FileAttachments: any[] = []
      if (reportIds.length) {
        const { data: f5Attachments } = await supabase
          .from('err_program_files')
          .select('report_id, file_url, file_name, file_type')
          .in('report_id', reportIds)
        if (f5Attachments) {
          f5FileAttachments.push(...f5Attachments)
        }
      }

      return NextResponse.json({ 
        project, 
        summaries: summariesWithExpenses,
        f5Reports: f5ReportsWithReach,
        is_historical: false,
        file_keys: {
          f1_file: project.file_key || null,
          f2_approval: project.approval_file_key || null,
          payment_confirmation: mouFileKeys?.payment_confirmation_file || null,
          signed_mou: mouFileKeys?.signed_mou_file_key || null
        },
        f4_files: f4FileAttachments,
        f5_files: f5FileAttachments
      })
    }
  } catch (e) {
    console.error('overview/project detail error', e)
    return NextResponse.json({ error: 'Failed to load project detail' }, { status: 500 })
  }
}


