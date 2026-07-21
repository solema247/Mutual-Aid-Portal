update allocations_by_date
set
  "Allocation Amount" = 300000,
  "%_Decision_Amount" = 15,
  "Notes" = 'First tranche ($300,000) of $2,000,000 decision. Additional allocations can be added for later tranches.'
where "Allocation_ID" = 'LCC.AD.P2H.20-06-26-55-01';

update distribution_decision_master_sheet_1
set
  sum_allocation_amount = 300000,
  notes = 'Decision envelope $2,000,000. First tranche allocated $300,000 to North Kordofan; add further allocations as later tranches are funded.',
  updated_at = now()
where decision_id_proposed = 'LCC.AD.P2H.20-06-26-56';
