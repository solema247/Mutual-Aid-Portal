/*
 * VOLUNTEER COMMUNICATIONS DETAILS
 *
 * PURPOSE:
 * Line-by-line detail of volunteer communications spending
 * (phones, internet, Starlink, Wi-Fi, laptops, connectivity allowances)
 *
 * Separate from protection but related: supports volunteer coordination and safety.
 *
 * DATA PATHS:
 *   - Portal projects: err_expense.project_id -> err_projects
 *   - Historical backfill: err_expense.activities_raw_import_id -> activities_raw_import
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
    WHEN ex.expense_description ~* '(phone|smartphone|mobile|iphone|samsung|honor|tecno|poco|هاتف)'
      THEN 'phones_devices'
    WHEN ex.expense_description ~* '(internet|starlink|wifi|wi-fi|connectivity|data bundle|airtime|subscription|إنترنت|شبكة|اتصال)'
      THEN 'internet_connectivity'
    WHEN ex.expense_description ~* '(laptop|tablet|computer|لابتوب)'
      THEN 'devices'
    ELSE 'communication_general'
  END AS communications_type

FROM public.err_expense ex
LEFT JOIN public.err_projects p ON p.id = ex.project_id
LEFT JOIN public.activities_raw_import a ON a.id = ex.activities_raw_import_id

WHERE ex.expense_amount IS NOT NULL
  AND (ex.project_id IS NOT NULL OR ex.activities_raw_import_id IS NOT NULL)
  AND (
    ex.expense_description ~* '(communic|internet|phone|smartphone|mobile|sim card|\msim\M|starlink|connectivity|data bundle|airtime|top.?up|wifi|wi-fi|laptop|tablet|اتصالات|هاتف|إنترنت|شبكة|تواصل|اتصال)'
    OR lower(trim(COALESCE(ex.expense_activity, ''))) ~* '(communic|اتصالات|تواصل)'
  )
  AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
  -- Exclude lines already classified as protection
  AND NOT (
    (ex.expense_description ~* '(evacuat|إجلاء|relocat|deportation|medical|treatment|hospital|injury|shot|shrapnel|trapped|arrest|detention|fine|psycholog|volunteer''s family|family of volunteer|علاج|طبي|اعتقال|كفالة|دعم نفسي)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)')
    OR (ex.expense_description ~* '(danger|risk|emergency|crisis|unsafe|خطر|طوارئ|أزمة)'
      AND ex.expense_description ~* '(volunteer|متطوع|coordinator|منسق|responder)'
      AND NOT ex.expense_description ~* '(emergency room|غرفة طوارئ)')
  )

ORDER BY ex.expense_amount DESC;
