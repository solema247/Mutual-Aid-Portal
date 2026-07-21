update distribution_decision_master_sheet_1
set
  notes = 'Decision envelope $2,000,000. Sheet / calculator ref was LCC.AD.P2H.20-06-26-56. Add further allocations as later tranches are funded.',
  updated_at = now()
where decision_id_proposed = 'LCC.P2H.2026-06-21.Emer';
