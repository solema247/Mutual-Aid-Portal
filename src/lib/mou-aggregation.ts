/**
 * Utility functions to aggregate data from multiple projects for MOU display
 */

interface Project {
  project_objectives?: string | null
  intended_beneficiaries?: string | null
  estimated_beneficiaries?: number | null
  planned_activities?: string | null
  planned_activities_resolved?: string | null
  locality?: string | null
  state?: string | null
  banking_details?: string | null
  expenses?: any
  err_id?: string | null
  emergency_room_id?: string | null
  emergency_rooms?: { name?: string | null; name_ar?: string | null; err_code?: string | null } | null
  grant_id?: string | null
}

/**
 * Aggregates objectives from all projects.
 * If all projects have identical objectives, returns that.
 * Otherwise, returns the most common one or the first non-null one.
 */
export function aggregateObjectives(projects: Project[]): string | null {
  if (!projects || projects.length === 0) return null
  
  const objectives = projects
    .map(p => p.project_objectives)
    .filter(Boolean) as string[]
  
  if (objectives.length === 0) return null
  
  // If all objectives are identical, return that
  const first = objectives[0]
  if (objectives.every(obj => obj === first)) {
    return first
  }
  
  // Otherwise, return the most common one, or the first
  const counts: Record<string, number> = {}
  objectives.forEach(obj => {
    counts[obj] = (counts[obj] || 0) + 1
  })
  
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || first
}

/**
 * Aggregates beneficiaries from all projects.
 * Same logic as objectives.
 */
export function aggregateBeneficiaries(projects: Project[]): string | null {
  if (!projects || projects.length === 0) return null
  
  const beneficiaries = projects
    .map(p => p.intended_beneficiaries)
    .filter(Boolean) as string[]
  
  if (beneficiaries.length === 0) return null
  
  const first = beneficiaries[0]
  if (beneficiaries.every(ben => ben === first)) {
    return first
  }
  
  const counts: Record<string, number> = {}
  beneficiaries.forEach(ben => {
    counts[ben] = (counts[ben] || 0) + 1
  })
  
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || first
}

/**
 * Aggregates planned activities from all projects.
 * Collects all unique activities and returns them as a bulleted list.
 */
export function aggregatePlannedActivities(projects: Project[]): string | null {
  if (!projects || projects.length === 0) return null
  
  const activitySet = new Set<string>()
  
  projects.forEach(project => {
    // Try to use resolved activities first
    if (project.planned_activities_resolved) {
      const activities = project.planned_activities_resolved
        .split('\n')
        .map(a => a.trim())
        .filter(Boolean)
      activities.forEach(a => activitySet.add(a))
    } else if (project.planned_activities) {
      try {
        // Try parsing as JSON array
        const raw = typeof project.planned_activities === 'string' 
          ? JSON.parse(project.planned_activities) 
          : project.planned_activities
        
        if (Array.isArray(raw)) {
          raw.forEach((item: any) => {
            const activityName = item?.activity || item?.selectedActivity || item?.activity_name || String(item)
            if (activityName && typeof activityName === 'string') {
              activitySet.add(activityName.trim())
            }
          })
        } else if (typeof raw === 'string') {
          // If it's a string, split by newlines
          raw.split('\n').forEach((a: string) => {
            const trimmed = a.trim()
            if (trimmed) activitySet.add(trimmed)
          })
        }
      } catch {
        // If parsing fails, treat as plain string
        if (typeof project.planned_activities === 'string') {
          project.planned_activities.split('\n').forEach((a: string) => {
            const trimmed = a.trim()
            if (trimmed) activitySet.add(trimmed)
          })
        }
      }
    }
  })
  
  if (activitySet.size === 0) return null
  
  // Return as bulleted list
  return Array.from(activitySet).map(a => `• ${a}`).join('\n')
}

/**
 * Aggregates planned activities with detailed information (cost/amount).
 * Returns formatted string showing activity name -> amount.
 */
export function aggregatePlannedActivitiesDetailed(projects: Project[]): string | null {
  if (!projects || projects.length === 0) return null
  
  interface ActivityDetail {
    activity: string
    cost: number | null
  }
  
  const activityMap = new Map<string, ActivityDetail>()
  
  projects.forEach(project => {
    if (project.planned_activities) {
      try {
        const raw = typeof project.planned_activities === 'string' 
          ? JSON.parse(project.planned_activities) 
          : project.planned_activities
        
        if (Array.isArray(raw)) {
          raw.forEach((item: any) => {
            const activityName = item?.activity || item?.selectedActivity || item?.activity_name
            if (activityName && typeof activityName === 'string') {
              const key = activityName.trim()
              const existing = activityMap.get(key)
              const cost = item?.planned_activity_cost || item?.cost || null
              
              if (existing) {
                // Aggregate cost if activity already exists
                if (cost !== null && cost > 0) {
                  existing.cost = (existing.cost || 0) + cost
                }
              } else {
                // Add new activity
                activityMap.set(key, {
                  activity: key,
                  cost: cost
                })
              }
            }
          })
        }
      } catch {
        // If parsing fails, fall back to simple aggregation
        return aggregatePlannedActivities(projects)
      }
    }
  })
  
  if (activityMap.size === 0) return null
  
  // Format activities as: "• Activity Name -> $Amount"
  const formatted = Array.from(activityMap.values()).map(act => {
    if (act.cost !== null && act.cost > 0) {
      return `• ${act.activity} -> $${act.cost.toLocaleString()}`
    } else {
      return `• ${act.activity}`
    }
  })
  
  return formatted.join('\n')
}

/**
 * Aggregates locations from all projects.
 * Returns a comma-separated list of unique localities, or a count if there are many.
 */
export function aggregateLocations(projects: Project[]): { localities: string; state: string | null } {
  if (!projects || projects.length === 0) {
    return { localities: '', state: null }
  }
  
  const localitySet = new Set<string>()
  const stateSet = new Set<string>()
  
  projects.forEach(project => {
    if (project.locality) localitySet.add(project.locality)
    if (project.state) stateSet.add(project.state)
  })
  
  const localities = Array.from(localitySet).filter(Boolean)
  const states = Array.from(stateSet).filter(Boolean)
  
  // If there are many localities (5+), show count instead
  let localityStr = ''
  if (localities.length === 0) {
    localityStr = '-'
  } else if (localities.length <= 4) {
    localityStr = localities.join(', ')
  } else {
    localityStr = `${localities.length} localities`
  }
  
  const state = states.length > 0 ? states[0] : null // Usually all projects in same state
  
  return { localities: localityStr, state }
}

/**
 * Calculates total amount from expenses
 */
function calculateTotalAmount(expenses: any): number {
  if (!expenses) return 0
  try {
    const expArray = typeof expenses === 'string' ? JSON.parse(expenses || '[]') : (Array.isArray(expenses) ? expenses : [])
    return expArray.reduce((sum: number, exp: any) => sum + (exp?.total_cost || 0), 0)
  } catch {
    return 0
  }
}

/**
 * Gets banking details from all projects and formats them in a table structure
 * Returns formatted string with all account details from all projects
 */
export function getBankingDetails(projects: Project[]): string | null {
  if (!projects || projects.length === 0) return null
  
  // Collect all projects with banking details
  const accounts: Array<{
    location: string
    banking_details: string
    amount: number
  }> = []
  
  projects.forEach(project => {
    const banking = (project as any).banking_details
    if (!banking) return
    
    // Get location (ERR name or locality)
    let location = ''
    if (project.emergency_rooms?.name_ar) {
      location = project.emergency_rooms.name_ar
    } else if (project.emergency_rooms?.name) {
      location = project.emergency_rooms.name
    } else if (project.err_id) {
      location = project.err_id
    } else if (project.locality) {
      location = project.locality
    } else {
      location = project.state || 'Unknown'
    }
    
    // Calculate amount from expenses
    const amount = calculateTotalAmount(project.expenses)
    
    accounts.push({
      location,
      banking_details: banking,
      amount
    })
  })
  
  if (accounts.length === 0) return null
  
  // Format as table structure similar to the image
  // Each account is separated with a header showing the location
  const formattedAccounts = accounts.map((account, index) => {
    const lines: string[] = []
    
    // Add location header (just the location name)
    lines.push(account.location)
    lines.push('') // Empty line
    
    // Add banking details (preserve original formatting)
    // The banking_details field should contain the account information
    lines.push(account.banking_details)
    
    // Add amount if available
    if (account.amount > 0) {
      lines.push(`Amount USD: ${account.amount.toLocaleString()} $`)
    }
    
    // Add separator line between accounts (except for last one)
    if (index < accounts.length - 1) {
      lines.push('')
      lines.push('─'.repeat(50))
      lines.push('')
    }
    
    return lines.join('\n')
  })
  
  return formattedAccounts.join('\n')
}

/**
 * Gets location label for a project (ERR name, locality, or state)
 */
function getProjectLocation(project: Project): string {
  if (project.emergency_rooms?.name_ar) {
    return project.emergency_rooms.name_ar
  } else if (project.emergency_rooms?.name) {
    return project.emergency_rooms.name
  } else if (project.err_id) {
    return project.err_id
  } else if (project.locality) {
    return project.locality
  } else {
    return project.state || 'Unknown'
  }
}

/**
 * Formats expenses into a budget table structure
 * Returns HTML table string with all projects showing: No, Serial Number, ERR Code, ERR Name, category columns, Total
 */
export function getBudgetTable(projects: Project[]): string | null {
  if (!projects || projects.length === 0) return null
  
  // First, collect all unique categories from all projects' planned_activities
  const allCategories = new Set<string>()
  const projectData: Array<{
    project: Project
    categories: Map<string, number> // category -> total cost
    total: number
  }> = []
  
  projects.forEach(project => {
    const categoryMap = new Map<string, number>()
    let projectTotal = 0
    
    // Parse planned_activities to extract categories and costs
    if (project.planned_activities) {
      try {
        const raw = typeof project.planned_activities === 'string' 
          ? JSON.parse(project.planned_activities) 
          : project.planned_activities
        
        if (Array.isArray(raw)) {
          raw.forEach((item: any) => {
            const category = item?.category
            const cost = item?.planned_activity_cost || 0
            
            // Process if cost > 0, even if category is null
            if (cost > 0) {
              // Use "Uncategorized" for null/empty categories
              const categoryName = (category && typeof category === 'string' && category.trim()) 
                ? category.trim() 
                : 'Uncategorized'
              
              allCategories.add(categoryName)
              
              // Sum costs for the same category in this project
              const currentCost = categoryMap.get(categoryName) || 0
              categoryMap.set(categoryName, currentCost + cost)
              projectTotal += cost
            }
          })
        }
      } catch {
        // If parsing fails, skip this project's activities
      }
    }
    
    projectData.push({
      project,
      categories: categoryMap,
      total: projectTotal
    })
  })
  
  if (projectData.length === 0) return null
  
  // Sort categories alphabetically for consistent column order
  const sortedCategories = Array.from(allCategories).sort()
  
  // Build table rows - one row per project
  const rows: string[] = []
  let rowNumber = 1
  
  projectData.forEach(({ project, categories, total }) => {
    const serialNumber = project.grant_id || '-'
    const errCode = project.err_id || '-'
    const errName = project.emergency_rooms?.name || project.emergency_rooms?.name_ar || '-'
    
    // Build category cells
    const categoryCells = sortedCategories.map(category => {
      const cost = categories.get(category) || 0
      return `<td style="border: 1px solid #ddd; padding: 6px; text-align: right; font-size: 12px;">${cost > 0 ? cost.toLocaleString() : '-'}</td>`
    }).join('')
    
    rows.push(`
      <tr>
        <td style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 12px;">${rowNumber}</td>
        <td style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">${escapeHtml(serialNumber)}</td>
        <td style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">${escapeHtml(errCode)}</td>
        <td style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">${escapeHtml(errName)}</td>
        ${categoryCells}
        <td style="border: 1px solid #ddd; padding: 6px; text-align: right; font-size: 12px; font-weight: bold;">${total > 0 ? total.toLocaleString() : '-'}</td>
      </tr>
    `)
    
    rowNumber++
  })
  
  // Calculate totals for each category and grand total
  const categoryTotals = new Map<string, number>()
  let grandTotal = 0
  
  projectData.forEach(({ categories, total }) => {
    categories.forEach((cost, category) => {
      const currentTotal = categoryTotals.get(category) || 0
      categoryTotals.set(category, currentTotal + cost)
    })
    grandTotal += total
  })
  
  // Build total row
  const totalCategoryCells = sortedCategories.map(category => {
    const total = categoryTotals.get(category) || 0
    return `<td style="border: 1px solid #ddd; padding: 6px; text-align: right; font-size: 12px; font-weight: bold;">${total > 0 ? total.toLocaleString() : '-'}</td>`
  }).join('')
  
  rows.push(`
    <tr style="background-color: #f9f9f9; font-weight: bold;">
      <td colspan="4" style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">Total</td>
      ${totalCategoryCells}
      <td style="border: 1px solid #ddd; padding: 6px; text-align: right; font-size: 12px;">${grandTotal.toLocaleString()}</td>
    </tr>
  `)
  
  // Build category header cells
  const categoryHeaders = sortedCategories.map(category => {
    return `<th style="border: 1px solid #ddd; padding: 6px; text-align: right; font-size: 12px;">${escapeHtml(category)}</th>`
  }).join('')
  
  // Build complete table
  const tableHtml = `
    <table style="width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="border: 1px solid #ddd; padding: 6px; text-align: center; font-size: 12px;">No</th>
          <th style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">Serial Number</th>
          <th style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">ERR Code</th>
          <th style="border: 1px solid #ddd; padding: 6px; font-size: 12px;">ERR Name</th>
          ${categoryHeaders}
          <th style="border: 1px solid #ddd; padding: 6px; text-align: right; font-size: 12px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  `
  
  return tableHtml
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Returns structured budget data grouped by ERR for hierarchical table display
 */
export interface BudgetActivity {
  category: string
  amount: number
  beneficiaries: number
}

export interface BudgetERR {
  errId: string
  errCode: string
  errName: string
  beneficiaries: number
  activities: BudgetActivity[]
  subtotal: number
}

export interface BudgetTableData {
  errs: BudgetERR[]
  allCategories: string[]
  grandTotal: number
}

export function getBudgetTableData(projects: Project[]): BudgetTableData | null {
  if (!projects || projects.length === 0) return null

  // Group projects by ERR
  const errMap = new Map<string, {
    errCode: string
    errName: string
    projects: Project[]
    categoryMap: Map<string, { cost: number; beneficiaries: number }> // category -> {cost, beneficiaries} across all projects in this ERR
    beneficiaries: number
  }>()

  const allCategories = new Set<string>()

  projects.forEach(project => {
    // Get ERR identifier (use err_id or emergency_room_id)
    const errKey = project.err_id || project.emergency_room_id || 'unknown'
    const errCode = project.err_id || project.emergency_rooms?.err_code || '-'
    const errName = project.emergency_rooms?.name || project.emergency_rooms?.name_ar || '-'

    // Get or create ERR entry
    if (!errMap.has(errKey)) {
      errMap.set(errKey, {
        errCode,
        errName,
        projects: [],
        categoryMap: new Map(),
        beneficiaries: 0
      })
    }

    const errData = errMap.get(errKey)!

    // Add project to ERR
    errData.projects.push(project)

    // Add beneficiaries (sum them)
    if (project.estimated_beneficiaries) {
      errData.beneficiaries += project.estimated_beneficiaries
    }

    // Parse planned_activities to extract categories, costs, and beneficiaries
    if (project.planned_activities) {
      try {
        const raw = typeof project.planned_activities === 'string'
          ? JSON.parse(project.planned_activities)
          : project.planned_activities

        if (Array.isArray(raw)) {
          raw.forEach((item: any) => {
            const category = item?.category
            const cost = item?.planned_activity_cost || 0
            const activityBeneficiaries = item?.individuals || 0

            if (cost > 0) {
              const categoryName = (category && typeof category === 'string' && category.trim())
                ? category.trim()
                : 'Uncategorized'

              allCategories.add(categoryName)

              // Sum costs and beneficiaries for the same category across all projects in this ERR
              const current = errData.categoryMap.get(categoryName) || { cost: 0, beneficiaries: 0 }
              errData.categoryMap.set(categoryName, {
                cost: current.cost + cost,
                beneficiaries: current.beneficiaries + (activityBeneficiaries || 0)
              })
            }
          })
        }
      } catch {
        // If parsing fails, skip this project's activities
      }
    }
  })

  if (errMap.size === 0) return null

  // Convert to array and calculate subtotals
  const sortedCategories = Array.from(allCategories).sort()
  const errs: BudgetERR[] = []

  errMap.forEach((data, errId) => {
    // Convert category map to activities array
    const activities: BudgetActivity[] = sortedCategories
      .map(category => {
        const categoryData = data.categoryMap.get(category)
        if (!categoryData || categoryData.cost === 0) return null
        return {
          category,
          amount: categoryData.cost,
          beneficiaries: categoryData.beneficiaries
        }
      })
      .filter((act): act is BudgetActivity => act !== null)

    // Calculate subtotal
    const subtotal = activities.reduce((sum, act) => sum + act.amount, 0)

    errs.push({
      errId,
      errCode: data.errCode,
      errName: data.errName,
      beneficiaries: data.beneficiaries,
      activities,
      subtotal
    })
  })

  // Calculate grand total
  const grandTotal = errs.reduce((sum, err) => sum + err.subtotal, 0)

  return {
    errs,
    allCategories: sortedCategories,
    grandTotal
  }
}

