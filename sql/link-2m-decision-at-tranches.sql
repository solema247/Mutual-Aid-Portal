-- Link portal $2M decision to AT Emer decision + its two $300K allocations.
-- AT: LCC.P2H.2026-06-21.Emer (recLufyMJksxPtnTY)
-- AT allocs: LCC.AD.P2H.26-06-21.579 (rec11uWBALpgP5jTX), LCC.AD.P2H.26-06-21.657 (rec4kfK8rQU0bisgD)

-- 1) Point portal decision at the AT Emer record
update distribution_decision_master_sheet_1
set
  airtable_record_id = 'recLufyMJksxPtnTY',
  notes = 'Decision envelope $2,000,000 (AT: LCC.P2H.2026-06-21.Emer). Linked tranche allocations: LCC.AD.P2H.26-06-21.579 and LCC.AD.P2H.26-06-21.657 ($300,000 each). Add further allocations as later tranches are funded.',
  updated_at = now()
where decision_id_proposed = 'LCC.AD.P2H.20-06-26-56';

-- 2) Remove placeholder tranche allocation created earlier
delete from allocations_by_date
where "Allocation_ID" = 'LCC.AD.P2H.20-06-26-55-01';

-- 3) Insert the two AT allocations under the $2M portal decision
insert into allocations_by_date (
  "Allocation_ID",
  "Decision_ID",
  "State",
  "Allocation Amount",
  "%_Decision_Amount",
  "Decision_Amount",
  "Decision_Date",
  "Partner",
  "Notes",
  "Serial",
  airtable_record_id,
  sync_status,
  google_sheet_code
) values
(
  'LCC.AD.P2H.26-06-21.579',
  'LCC.AD.P2H.20-06-26-56',
  'North Kordofan',
  300000,
  15,
  2000000,
  '2026-06-21',
  'P2H',
  'Tranche allocation from AT (linked via LCC.P2H.2026-06-21.Emer). $300,000 of $2,000,000 decision.',
  1,
  'rec11uWBALpgP5jTX',
  'legacy',
  null
),
(
  'LCC.AD.P2H.26-06-21.657',
  'LCC.AD.P2H.20-06-26-56',
  'North Kordofan',
  300000,
  15,
  2000000,
  '2026-06-21',
  'P2H',
  'Tranche allocation from AT (linked via LCC.P2H.2026-06-21.Emer). $300,000 of $2,000,000 decision.',
  2,
  'rec4kfK8rQU0bisgD',
  'legacy',
  null
)
on conflict ("Allocation_ID") do update set
  "Decision_ID" = excluded."Decision_ID",
  "State" = excluded."State",
  "Allocation Amount" = excluded."Allocation Amount",
  "%_Decision_Amount" = excluded."%_Decision_Amount",
  "Decision_Amount" = excluded."Decision_Amount",
  "Decision_Date" = excluded."Decision_Date",
  "Partner" = excluded."Partner",
  "Notes" = excluded."Notes",
  "Serial" = excluded."Serial",
  airtable_record_id = excluded.airtable_record_id;

-- 4) Refresh decision sum ($600K)
update distribution_decision_master_sheet_1
set
  sum_allocation_amount = 600000,
  updated_at = now()
where decision_id_proposed = 'LCC.AD.P2H.20-06-26-56';
