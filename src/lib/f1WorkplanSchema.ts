import { z } from 'zod'

const nullableStr = z.union([z.string(), z.null()]).optional()

export const f1ExpenseRowSchema = z.object({
  activity: z.string(),
  total_cost: z.number().finite(),
  category: z.union([z.string(), z.null()]).optional(),
  planned_activity: z.union([z.string(), z.null()]).optional(),
  planned_activity_other: z.union([z.string(), z.null()]).optional()
})

/** Planned activity objects from OCR/manual (flexible keys). */
export const f1WorkplanCreateSchema = z
  .object({
    mode: z.enum(['manual', 'ocr']),
    emergency_room_id: z.string().uuid(),
    grant_segment: z.union([z.string().min(1), z.null()]).optional(),
    date: nullableStr,
    locality: nullableStr,
    project_objectives: nullableStr,
    intended_beneficiaries: nullableStr,
    estimated_beneficiaries: z.number().int().nullable().optional(),
    estimated_timeframe: nullableStr,
    additional_support: nullableStr,
    banking_details: nullableStr,
    program_officer_name: nullableStr,
    program_officer_phone: nullableStr,
    reporting_officer_name: nullableStr,
    reporting_officer_phone: nullableStr,
    finance_officer_name: nullableStr,
    finance_officer_phone: nullableStr,
    planned_activities: z.array(z.any()).max(2000).default([]),
    expenses: z.array(f1ExpenseRowSchema).max(2000),
    original_text: z.any().optional(),
    language: z.string().max(16).default('en'),
    temp_file_key: z.union([z.string().min(1).max(2048), z.null()]).optional(),
    ocr_edited_fields_count: z.number().int().min(0).nullable().optional()
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.mode === 'ocr') {
      const key = data.temp_file_key
      if (key == null || String(key).trim() === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'temp_file_key is required for OCR uploads',
          path: ['temp_file_key']
        })
      }
    }
  })

export type F1WorkplanCreateInput = z.infer<typeof f1WorkplanCreateSchema>
