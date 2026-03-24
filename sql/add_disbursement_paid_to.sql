-- Add "Paid To" column to activities_raw_import for storing disbursement recipient info
-- from the Disbursement Overview sheet
ALTER TABLE activities_raw_import ADD COLUMN IF NOT EXISTS "Paid To" text;
