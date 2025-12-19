/**
 * Utility functions to aggregate data from multiple projects for MOU display
 */

interface Project {
  project_objectives?: string | null
  intended_beneficiaries?: string | null
  planned_activities?: string | null
  planned_activities_resolved?: string | null
  locality?: string | null
  state?: string | null
  banking_details?: string | null
  expenses?: any
  err_id?: string | null
  emergency_room_id?: string | null
  emergency_rooms?: { name?: string | null; name_ar?: string | null; err_code?: string | null } | null
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

