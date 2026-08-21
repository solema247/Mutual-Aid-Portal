/*
 * VOLUNTEER PROTECTION BY STATE
 *
 * PURPOSE:
 * Geographic breakdown of volunteer protection spending
 * Shows each state with separate columns for each protection type
 *
 * DATA PATHS:
 *   - Portal projects: err_expense.project_id -> err_projects
 *   - Historical backfill: err_expense.activities_raw_import_id -> activities_raw_import
 *
 * USE: Understanding which states have highest protection needs
 */

WITH classified AS (
  SELECT
    COALESCE(p.state, a."State") AS state,
    COALESCE(p.err_id, a."ERR CODE") AS err_id,
    ex.expense_amount,

    CASE
      WHEN ex.expense_description ~* '(evacuat|إجلاء|اجلاء|relocat|displace|refuge|flee|fled|escape|deportation|نزوح|لجوء|فرار|هروب)'
        AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
        THEN 'evacuation_relocation'

      WHEN ex.expense_description ~* '(medical|treatment|hospital|surgery|injury|injured|wound|shot|shrapnel|harm|chemotherapy|علاج|طبي|مستشف|عملية|إصابة|جرح|أذى)'
        AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
        THEN 'medical_injury'

      WHEN ex.expense_description ~* '(volunteer''s family|family of volunteer|volunteer family|volunteer''s father|volunteer''s mother|volunteer''s son|volunteer''s daughter|أسرة المتطوع|عائلة المتطوع|والد المتطوع|والدة المتطوع)'
        AND ex.expense_description ~* '(treatment|medical|support|costs|care|علاج|طبي|دعم|تكلف)'
        THEN 'medical_injury'

      WHEN ex.expense_description ~* '(trapped|stranded|besieged|rescue|محاصر|عالق|محتجز)'
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
)

SELECT
  state,
  COUNT(DISTINCT err_id) FILTER (WHERE err_id IS NOT NULL) AS errs_with_protection,

  ROUND(SUM(expense_amount)::numeric, 2) AS total_protection_usd,

  ROUND(SUM(expense_amount) FILTER (WHERE protection_type = 'evacuation_relocation')::numeric, 2) AS evacuation_relocation_usd,
  ROUND(SUM(expense_amount) FILTER (WHERE protection_type = 'medical_injury')::numeric, 2) AS medical_injury_usd,
  ROUND(SUM(expense_amount) FILTER (WHERE protection_type = 'trapped_rescue')::numeric, 2) AS trapped_rescue_usd,
  ROUND(SUM(expense_amount) FILTER (WHERE protection_type = 'security_threats')::numeric, 2) AS security_threats_usd,
  ROUND(SUM(expense_amount) FILTER (WHERE protection_type = 'danger_emergency')::numeric, 2) AS danger_emergency_usd,
  ROUND(SUM(expense_amount) FILTER (WHERE protection_type = 'mental_health_pss')::numeric, 2) AS mental_health_pss_usd,

  COUNT(*) FILTER (WHERE protection_type = 'evacuation_relocation') AS evacuation_lines,
  COUNT(*) FILTER (WHERE protection_type = 'medical_injury') AS medical_lines,
  COUNT(*) FILTER (WHERE protection_type = 'trapped_rescue') AS trapped_lines,
  COUNT(*) FILTER (WHERE protection_type = 'security_threats') AS security_lines,
  COUNT(*) FILTER (WHERE protection_type = 'danger_emergency') AS danger_lines,
  COUNT(*) FILTER (WHERE protection_type = 'mental_health_pss') AS mental_health_lines

FROM classified
WHERE protection_type IS NOT NULL
GROUP BY state
ORDER BY total_protection_usd DESC NULLS LAST;
