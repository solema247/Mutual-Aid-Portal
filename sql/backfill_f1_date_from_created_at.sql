-- If your err_projects table does not have a "created_at" column, but you need to backfill based on another timestamp or date column,
-- Replace "created_at" below with the name of the column that should be used as the source date (e.g. "created_by", "inserted_at", or similar).
-- Example, if the correct column is "created_by", use:

-- UPDATE err_projects
-- SET date = (date_trunc('month', created_by)::date)
-- WHERE date IS NULL
--   AND created_by IS NOT NULL;

-- If you are not sure which column to use, inspect your table schema using:
--   select column_name from information_schema.columns where table_name = 'err_projects';

-- If your "date" column is TEXT instead of DATE, use:
-- UPDATE err_projects
-- SET date = to_char(date_trunc('month', created_by)::date, 'YYYY-MM-DD')
-- WHERE date IS NULL
--   AND created_by IS NOT NULL;