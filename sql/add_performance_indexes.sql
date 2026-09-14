-- Performance indexes for Project Management page queries
-- Safe to apply - indexes do not modify data, only speed up lookups

-- Index for err_expense queries filtered by project_id
-- Used in BATCH 2 when fetching project expenses
CREATE INDEX IF NOT EXISTS idx_err_expense_project_id 
  ON public.err_expense (project_id);

-- Index for err_program_report queries filtered by project_id
-- Used in BATCH 1 when fetching F5 reports for projects
CREATE INDEX IF NOT EXISTS idx_err_program_report_project_id 
  ON public.err_program_report (project_id);

-- Index for err_program_reach queries filtered by report_id
-- Used in BATCH 2 when fetching F5 reach data by report_id
CREATE INDEX IF NOT EXISTS idx_err_program_reach_report_id 
  ON public.err_program_reach (report_id);
