/*
 * VOLUNTEER PROTECTION SUMMARY
 *
 * PURPOSE:
 * Main query - shows all volunteer spending split into:
 *   1. PROTECTION (evacuation, medical, security threats, danger/emergency, mental health/PSS)
 *   2. COMMUNICATIONS (phones, internet, Starlink, connectivity for volunteers)
 *   3. INCENTIVES (stipends, allowances)
 *   4. OTHER SUPPORT (equipment, transport, training, general support)
 *
 * DATA PATHS:
 *   - Portal projects: err_expense.project_id -> err_projects
 *   - Historical backfill: err_expense.activities_raw_import_id -> activities_raw_import
 *
 * OUTPUT: Summary table with totals by category
 */

WITH expense_context AS (
  SELECT
    ex.expense_amount,
    ex.expense_activity,
    ex.expense_description,
    COALESCE(p.err_id, a."ERR CODE") AS err_id,
    COALESCE(ex.project_id::text, ex.activities_raw_import_id::text) AS spend_key
  FROM public.err_expense ex
  LEFT JOIN public.err_projects p ON p.id = ex.project_id
  LEFT JOIN public.activities_raw_import a ON a.id = ex.activities_raw_import_id
  WHERE ex.expense_amount IS NOT NULL
    AND (ex.project_id IS NOT NULL OR ex.activities_raw_import_id IS NOT NULL)
),

classified AS (
  SELECT
    expense_amount,
    err_id,
    spend_key,
    CASE
      -- PROTECTION: Evacuation & Relocation
      WHEN (expense_description ~* '(evacuat|إجلاء|اجلاء|relocat|displace|refuge|flee|fled|escape|deportation|نزوح|لجوء|فرار|هروب)'
        AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
      THEN 'protection_evacuation_relocation'

      -- PROTECTION: Medical & Injury (volunteer or volunteer family treatment)
      WHEN (expense_description ~* '(medical|treatment|hospital|clinic|surgery|injury|injured|wound|shot|shrapnel|harm|chemotherapy|علاج|طبي|مستشف|عملية|إصابة|جرح|أذى)'
        AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
      THEN 'protection_medical_injury'

      WHEN (expense_description ~* '(volunteer''s family|family of volunteer|volunteer family|volunteer''s father|volunteer''s mother|volunteer''s son|volunteer''s daughter|أسرة المتطوع|عائلة المتطوع|والد المتطوع|والدة المتطوع)'
        AND expense_description ~* '(treatment|medical|support|costs|care|علاج|طبي|دعم|تكلف)')
      THEN 'protection_medical_injury'

      -- PROTECTION: Trapped/Rescue
      WHEN (expense_description ~* '(trapped|stranded|stuck|blocked|besieged|rescue|محاصر|عالق|محتجز)'
        AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
      THEN 'protection_trapped_rescue'

      -- PROTECTION: Security Threats (arrest, detention, fines)
      WHEN (expense_description ~* '(arrest|detention|detain|jail|prison|custody|bail|guarantee|fine|legal|lawyer|harass|threat|intimidat|اعتقال|احتجاز|سجن|كفالة|ضمان|محامي|قانوني|تهديد|غرامة)'
        AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
      THEN 'protection_security_threats'

      -- PROTECTION: General Danger/Emergency
      WHEN (expense_description ~* '(danger|risk|emergency|crisis|unsafe|خطر|طوارئ|أزمة)'
        AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
        AND NOT expense_description ~* '(emergency room|غرفة طوارئ)')
      THEN 'protection_danger_emergency'

      -- PROTECTION: Mental Health/Psychosocial Support
      WHEN (expense_description ~* '(psycholog|mental health|trauma|counsel|pss|دعم نفسي|صدمة|علاج نفسي)'
        AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
      THEN 'protection_mental_health_pss'

      -- COMMUNICATIONS (phones, internet, connectivity for volunteers)
      WHEN (
        expense_description ~* '(communic|internet|phone|smartphone|mobile|sim card|\msim\M|starlink|connectivity|data bundle|airtime|top.?up|wifi|wi-fi|laptop|tablet|اتصالات|هاتف|إنترنت|شبكة|تواصل|اتصال)'
        OR lower(trim(COALESCE(expense_activity, ''))) ~* '(communic|اتصالات|تواصل)'
      )
      AND expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      THEN 'volunteer_communications'

      -- INCENTIVES/STIPENDS
      WHEN (lower(trim(COALESCE(expense_activity, ''))) LIKE '%incentive%'
        OR expense_description ~* '(incentive|stipend|allowance|salary|حافز|حوافز|نثرية|نثريات|راتب|مكافأة|صندوق دعم المتطوعين|volunteer fund)')
      THEN 'incentives_stipends'

      -- OTHER VOLUNTEER SUPPORT
      WHEN (lower(trim(COALESCE(expense_activity, ''))) LIKE '%volunteer%'
        OR expense_description ~* '(volunteer|متطوع|coordinator|منسق)')
      THEN 'other_volunteer_support'

      ELSE 'not_volunteer_related'
    END AS classification
  FROM expense_context
),

summary AS (
  SELECT
    CASE
      WHEN classification LIKE 'protection%' THEN 'PROTECTION'
      WHEN classification = 'volunteer_communications' THEN 'COMMUNICATIONS'
      WHEN classification = 'incentives_stipends' THEN 'INCENTIVES/STIPENDS'
      WHEN classification = 'other_volunteer_support' THEN 'OTHER VOLUNTEER SUPPORT'
    END AS category,
    classification AS sub_category,
    COUNT(*) AS line_items,
    COUNT(DISTINCT err_id) FILTER (WHERE err_id IS NOT NULL) AS distinct_errs,
    COUNT(DISTINCT spend_key) AS distinct_spend_units,
    ROUND(SUM(expense_amount)::numeric, 2) AS total_usd,
    ROUND(
      100.0 * SUM(expense_amount) / SUM(SUM(expense_amount)) OVER (),
      2
    ) AS pct_of_volunteer_spend
  FROM classified
  WHERE classification != 'not_volunteer_related'
  GROUP BY 1, 2
)

SELECT
  category,
  sub_category,
  line_items,
  distinct_errs,
  distinct_spend_units,
  total_usd,
  pct_of_volunteer_spend
FROM summary
ORDER BY
  CASE
    WHEN category = 'PROTECTION' THEN 1
    WHEN category = 'COMMUNICATIONS' THEN 2
    WHEN category = 'INCENTIVES/STIPENDS' THEN 3
    ELSE 4
  END,
  total_usd DESC;
