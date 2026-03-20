-- Atomic decrement RPC for GPU production counter
-- Prevents race conditions when multiple productions complete simultaneously.
-- Returns the new count and shutdown flag in a single round-trip.

CREATE OR REPLACE FUNCTION public.decrement_active_gpu_productions(p_user_id UUID)
RETURNS TABLE(new_count INTEGER, should_shutdown BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_count INTEGER;
  v_shutdown_requested BOOLEAN;
  v_status TEXT;
BEGIN
  -- Atomic decrement + read in a single UPDATE ... RETURNING
  UPDATE public.user_gcp_config
  SET active_gpu_productions = GREATEST(COALESCE(active_gpu_productions, 1) - 1, 0)
  WHERE user_id = p_user_id
  RETURNING
    active_gpu_productions,
    shutdown_after_production_requested,
    status
  INTO v_new_count, v_shutdown_requested, v_status;

  -- If no row found, return safe defaults
  IF NOT FOUND THEN
    new_count := 0;
    should_shutdown := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  new_count := v_new_count;
  should_shutdown := (v_new_count = 0 AND v_shutdown_requested = TRUE AND v_status = 'RUNNING');

  -- If shutting down, clear the flag atomically
  IF should_shutdown THEN
    UPDATE public.user_gcp_config
    SET shutdown_after_production_requested = FALSE
    WHERE user_id = p_user_id;
  END IF;

  RETURN NEXT;
END;
$$;

-- RPC to reset the counter to a specific value (used by safety valve)
CREATE OR REPLACE FUNCTION public.reset_active_gpu_productions(p_user_id UUID, p_count INTEGER DEFAULT 0)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.user_gcp_config
  SET active_gpu_productions = p_count
  WHERE user_id = p_user_id;
$$;
