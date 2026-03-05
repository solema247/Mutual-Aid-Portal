/**
 * Parse err_projects.planned_activities and expenses JSONB to extract
 * unique Activity and Expense Category values for filtering.
 * Historical projects (activities_raw_import) do not have this data.
 */

function parseJsonArray(raw: any): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function getActivityAndCategoryLists(
  plannedActivities: any,
  expenses: any
): { activity_list: string[]; expense_category_list: string[] } {
  const activities = new Set<string>()
  const categories = new Set<string>()

  // Activity from planned_activities: use the "activity" field only (per planned_activities JSONB shape)
  const planned = parseJsonArray(plannedActivities)
  for (const item of planned) {
    const a = item?.activity ?? item?.Activity
    if (a != null && String(a).trim() !== '') activities.add(String(a).trim())
    const c = item?.category ?? item?.Category
    if (c != null && String(c).trim() !== '') categories.add(String(c).trim())
  }

  // Activity/category from expenses: use activity or planned_activity, and category
  const exp = parseJsonArray(expenses)
  for (const item of exp) {
    const a = item?.activity ?? item?.planned_activity ?? item?.Activity
    if (a != null && String(a).trim() !== '') activities.add(String(a).trim())
    const c = item?.category ?? item?.Category
    if (c != null && String(c).trim() !== '') categories.add(String(c).trim())
  }

  return {
    activity_list: Array.from(activities).sort(),
    expense_category_list: Array.from(categories).sort(),
  }
}
