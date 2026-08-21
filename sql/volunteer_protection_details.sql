/*
 * VOLUNTEER PROTECTION DETAILS
 *
 * PURPOSE:
 * Line-by-line detail of all volunteer protection expenses
 * Shows full context: ERR, state, description, amount, protection type
 *
 * DATA PATHS:
 *   - Portal projects: err_expense.project_id -> err_projects
 *   - Historical backfill: err_expense.activities_raw_import_id -> activities_raw_import
 *
 * USE: Finding anecdotes and specific protection cases
 */

SELECT
  ex.expense_id,
  CASE
    WHEN ex.project_id IS NOT NULL THEN 'portal'
    ELSE 'historical_backfill'
  END AS data_source,
  COALESCE(p.err_id, a."ERR CODE") AS err_id,
  COALESCE(p.state, a."State") AS state,
  p.project_name,
  ex.expense_activity,
  ex.expense_description,
  ex.expense_amount,
  ex.payment_date,

  CASE
    WHEN ex.expense_description ~* '(evacuat|إجلاء|اجلاء|relocat|displace|refuge|flee|fled|escape|deportation|نزوح|لجوء|فرار|هروب)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      THEN 'evacuation_relocation'

    WHEN ex.expense_description ~* '(medical|treatment|hospital|surgery|clinic|injury|injured|wound|shot|shrapnel|harm|chemotherapy|علاج|طبي|مستشف|عملية|إصابة|جرح|أذى)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      THEN 'medical_injury'

    WHEN ex.expense_description ~* '(volunteer''s family|family of volunteer|volunteer family|volunteer''s father|volunteer''s mother|volunteer''s son|volunteer''s daughter|أسرة المتطوع|عائلة المتطوع|والد المتطوع|والدة المتطوع)'
      AND ex.expense_description ~* '(treatment|medical|support|costs|care|علاج|طبي|دعم|تكلف)'
      THEN 'medical_injury'

    WHEN ex.expense_description ~* '(trapped|stranded|stuck|blocked|besieged|rescue|محاصر|عالق|محتجز)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      THEN 'trapped_rescue'

    WHEN ex.expense_description ~* '(arrest|detention|detain|jail|prison|custody|bail|guarantee|fine|legal|lawyer|harass|threat|intimidat|اعتقال|احتجاز|كفالة|ضمان|محامي|قانوني|تهديد|غرامة)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      THEN 'security_threats'

    WHEN ex.expense_description ~* '(danger|risk|threat|emergency|crisis|unsafe|خطر|تهديد|طوارئ|أزمة)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      AND NOT ex.expense_description ~* '(emergency room|غرفة طوارئ)'
      THEN 'danger_emergency'

    WHEN ex.expense_description ~* '(psycholog|mental health|trauma|counsel|pss|دعم نفسي|صدمة|علاج نفسي)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      THEN 'mental_health_pss'
  END AS protection_type

FROM public.err_expense ex
LEFT JOIN public.err_projects p ON p.id = ex.project_id
LEFT JOIN public.activities_raw_import a ON a.id = ex.activities_raw_import_id

WHERE ex.expense_amount IS NOT NULL
  AND (ex.project_id IS NOT NULL OR ex.activities_raw_import_id IS NOT NULL)
  AND (
    (ex.expense_description ~* '(evacuat|إجلاء|اجلاء|relocat|displace|refuge|flee|fled|escape|deportation|نزوح|لجوء|فرار|هروب)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
    OR
    (ex.expense_description ~* '(medical|treatment|hospital|surgery|clinic|injury|injured|wound|shot|shrapnel|harm|chemotherapy|علاج|طبي|مستشف|عملية|إصابة|جرح|أذى)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
    OR
    (ex.expense_description ~* '(volunteer''s family|family of volunteer|volunteer family|volunteer''s father|volunteer''s mother|volunteer''s son|volunteer''s daughter|أسرة المتطوع|عائلة المتطوع|والد المتطوع|والدة المتطوع)'
      AND ex.expense_description ~* '(treatment|medical|support|costs|care|علاج|طبي|دعم|تكلف)')
    OR
    (ex.expense_description ~* '(trapped|stranded|stuck|blocked|besieged|rescue|محاصر|عالق|محتجز)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
    OR
    (ex.expense_description ~* '(arrest|detention|detain|jail|prison|custody|bail|guarantee|fine|legal|lawyer|harass|threat|intimidat|اعتقال|احتجاز|كفالة|ضمان|محامي|قانوني|تهديد|غرامة)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
    OR
    (ex.expense_description ~* '(danger|risk|emergency|crisis|unsafe|خطر|طوارئ|أزمة)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      AND NOT ex.expense_description ~* '(emergency room|غرفة طوارئ)')
    OR
    (ex.expense_description ~* '(psycholog|mental health|trauma|counsel|pss|دعم نفسي|صدمة|علاج نفسي)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
  )

ORDER BY ex.expense_amount DESC;
