-- Rename portal decision LCC.AD.P2H.20-06-26-56 → AT name LCC.P2H.2026-06-21.Emer
-- and attach AT File Link.

-- 1) Detach allocations (FK references decision_id_proposed)
update allocations_by_date
set "Decision_ID" = null
where "Decision_ID" = 'LCC.AD.P2H.20-06-26-56';

-- 2) Rename decision + sync AT identity / document / metadata
update distribution_decision_master_sheet_1
set
  decision_id_proposed = 'LCC.P2H.2026-06-21.Emer',
  decision_id = 'LCC.P2H.2026-06-21.Emer',
  decision_date = '2026-06-21',
  restriction = 'Emergency',
  file_name = 'Decision documents',
  file_link = 'https://drive.google.com/drive/folders/155ks8cScV90W1HaQFxtGDt9aeqJuvIA8',
  decision_documents = jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'file_name', 'Decision documents',
      'file_link', 'https://drive.google.com/drive/folders/155ks8cScV90W1HaQFxtGDt9aeqJuvIA8',
      'source', 'airtable',
      'uploaded_at', now()
    )
  ),
  notes = 'Decision envelope $2,000,000 (AT id). Sheet / calculator ref was LCC.AD.P2H.20-06-26-56. Tranche allocations: LCC.AD.P2H.26-06-21.579 and LCC.AD.P2H.26-06-21.657 ($300,000 each). Add further allocations as later tranches are funded.',
  airtable_record_id = 'recLufyMJksxPtnTY',
  updated_at = now()
where decision_id_proposed = 'LCC.AD.P2H.20-06-26-56';

-- 3) Re-attach allocations to the AT-named decision
update allocations_by_date
set
  "Decision_ID" = 'LCC.P2H.2026-06-21.Emer',
  "Decision_Amount" = 2000000,
  "Decision_Date" = '2026-06-21',
  "Restriction" = 'Emergency',
  google_sheet_code = coalesce(google_sheet_code, 'LCC.AD.P2H.20-06-26-56')
where "Allocation_ID" in ('LCC.AD.P2H.26-06-21.579', 'LCC.AD.P2H.26-06-21.657');
