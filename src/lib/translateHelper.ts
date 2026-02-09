/**
 * Shared translation helper for F4 and F5 reports
 * Translates Arabic text to English and preserves original text in JSONB format
 */

export interface TranslationResult<T> {
  translatedData: T
  originalText: Record<string, any>
}

/**
 * Translate a single text field from Arabic to English
 */
async function translateText(text: string | null): Promise<string | null> {
  if (!text || text.trim() === '') return text
  
  try {
    // Use full URL for server-side requests
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const translateUrl = `${baseUrl}/api/translate`
    
    const response = await fetch(translateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'ar', target: 'en' })
    })
    
    if (!response.ok) {
      console.warn('Translation failed for text:', text.substring(0, 50))
      return text // Fallback to original
    }
    
    const result = await response.json()
    return result.translatedText || text
  } catch (error) {
    console.warn('Translation error:', error)
    return text // Fallback to original
  }
}

/**
 * Translate an array of text items
 */
async function translateArray(items: string[]): Promise<string[]> {
  if (!Array.isArray(items) || items.length === 0) return []
  
  const translatedItems = []
  for (const item of items) {
    const translated = await translateText(item)
    translatedItems.push(translated || item)
  }
  return translatedItems
}

/**
 * Translate F4 summary fields from Arabic to English
 */
export async function translateF4Summary(data: any, sourceLanguage: string): Promise<TranslationResult<any>> {
  if (sourceLanguage !== 'ar') {
    return {
      translatedData: data,
      originalText: {
        source_language: sourceLanguage,
        beneficiaries: null,
        lessons: null,
        training: null,
        project_objectives: null,
        excess_expenses: null,
        surplus_use: null
      }
    }
  }

  // Build original text object
  const originalText = {
    source_language: sourceLanguage,
    beneficiaries: data.beneficiaries,
    lessons: data.lessons,
    training: data.training,
    project_objectives: data.project_objectives,
    excess_expenses: data.excess_expenses,
    surplus_use: data.surplus_use
  }

  // Translate all text fields
  const translatedData = { ...data }
  
  translatedData.beneficiaries = await translateText(data.beneficiaries)
  translatedData.lessons = await translateText(data.lessons)
  translatedData.training = await translateText(data.training)
  translatedData.project_objectives = await translateText(data.project_objectives)
  translatedData.excess_expenses = await translateText(data.excess_expenses)
  translatedData.surplus_use = await translateText(data.surplus_use)

  return { translatedData, originalText }
}

/**
 * Translate F4 expense fields from Arabic to English
 */
export async function translateF4Expenses(expenses: any[], sourceLanguage: string): Promise<TranslationResult<any[]>> {
  if (sourceLanguage !== 'ar') {
    return {
      translatedData: expenses,
      originalText: expenses.map(() => ({
        source_language: sourceLanguage,
        expense_activity: null,
        expense_description: null,
        seller: null
      }))
    }
  }

  const translatedExpenses = []
  const originalTexts = []

  for (const expense of expenses) {
    const originalText = {
      source_language: sourceLanguage,
      expense_activity: expense.expense_activity,
      expense_description: expense.expense_description,
      seller: expense.seller
    }

    const translatedExpense = {
      ...expense,
      expense_activity: await translateText(expense.expense_activity),
      expense_description: await translateText(expense.expense_description),
      seller: await translateText(expense.seller)
    }

    translatedExpenses.push(translatedExpense)
    originalTexts.push(originalText)
  }

  return { translatedData: translatedExpenses, originalText: originalTexts }
}

/**
 * Translate F5 report fields from Arabic to English
 */
export async function translateF5Report(data: any, sourceLanguage: string): Promise<TranslationResult<any>> {
  if (sourceLanguage !== 'ar') {
    return {
      translatedData: data,
      originalText: {
        source_language: sourceLanguage,
        positive_changes: null,
        negative_results: null,
        unexpected_results: null,
        lessons_learned: null,
        suggestions: null,
        reporting_person: null
      }
    }
  }

  // Build original text object
  const originalText = {
    source_language: sourceLanguage,
    positive_changes: data.positive_changes,
    negative_results: data.negative_results,
    unexpected_results: data.unexpected_results,
    lessons_learned: data.lessons_learned,
    suggestions: data.suggestions,
    reporting_person: data.reporting_person
  }

  // Translate all text fields
  const translatedData = { ...data }
  
  translatedData.positive_changes = await translateText(data.positive_changes)
  translatedData.negative_results = await translateText(data.negative_results)
  translatedData.unexpected_results = await translateText(data.unexpected_results)
  translatedData.lessons_learned = await translateText(data.lessons_learned)
  translatedData.suggestions = await translateText(data.suggestions)
  translatedData.reporting_person = await translateText(data.reporting_person)

  return { translatedData, originalText }
}

/**
 * Translate F5 reach activity fields from Arabic to English
 */
export async function translateF5Reach(reach: any[], sourceLanguage: string): Promise<TranslationResult<any[]>> {
  if (sourceLanguage !== 'ar') {
    return {
      translatedData: reach,
      originalText: reach.map(() => ({
        source_language: sourceLanguage,
        activity_name: null,
        activity_goal: null,
        location: null
      }))
    }
  }

  const translatedReach = []
  const originalTexts = []

  for (const activity of reach) {
    const originalText = {
      source_language: sourceLanguage,
      activity_name: activity.activity_name,
      activity_goal: activity.activity_goal,
      location: activity.location
    }

    const translatedActivity = {
      ...activity,
      activity_name: await translateText(activity.activity_name),
      activity_goal: await translateText(activity.activity_goal),
      location: await translateText(activity.location)
    }

    translatedReach.push(translatedActivity)
    originalTexts.push(originalText)
  }

  return { translatedData: translatedReach, originalText: originalTexts }
}
