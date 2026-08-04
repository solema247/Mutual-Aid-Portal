-- Atomically allocate the next workplan sequence for a grant.
-- Uses row-level locking via UPDATE so concurrent Assign/Reassign requests get unique numbers.
-- Run in Supabase SQL Editor if not already applied.

CREATE OR REPLACE FUNCTION public.allocate_next_workplan_sequence(
  p_grant_id text,
  p_donor_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  next_seq integer;
BEGIN
  UPDATE public.grants_grid_view
  SET max_workplan_sequence = COALESCE(max_workplan_sequence, 0) + 1,
      updated_at = now()
  WHERE grant_id = p_grant_id
    AND donor_name = p_donor_name
  RETURNING max_workplan_sequence INTO next_seq;

  IF next_seq IS NULL THEN
    RAISE EXCEPTION 'Grant not found for grant_id=% donor_name=%', p_grant_id, p_donor_name;
  END IF;

  RETURN next_seq;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_next_workplan_sequence(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_next_workplan_sequence(text, text) TO service_role;
