-- Migration: Drop inngest_run_id column from tasks table
-- ============================================================================
-- The inngest_run_id column was used when Inngest was the task queue system.
-- The project has fully migrated to BullMQ, so this column is unused.
-- ============================================================================

-- 1. Drop the inngest_run_id column
ALTER TABLE public.tasks DROP COLUMN IF EXISTS inngest_run_id;

-- 2. Recreate the protect_tasks_sensitive_columns trigger function
--    without the inngest_run_id check
CREATE OR REPLACE FUNCTION public.protect_tasks_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.status';
  END IF;
  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.current_phase';
  END IF;
  IF NEW.current_step IS DISTINCT FROM OLD.current_step THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.current_step';
  END IF;
  IF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.progress_percent';
  END IF;
  IF NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.error_message';
  END IF;
  IF NEW.retry_count IS DISTINCT FROM OLD.retry_count THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.retry_count';
  END IF;
  IF NEW.max_retries IS DISTINCT FROM OLD.max_retries THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.max_retries';
  END IF;
  IF NEW.output_data IS DISTINCT FROM OLD.output_data THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.output_data';
  END IF;
  IF NEW.steps IS DISTINCT FROM OLD.steps THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.steps';
  END IF;
  IF NEW.research IS DISTINCT FROM OLD.research THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.research';
  END IF;
  IF NEW.master_outline IS DISTINCT FROM OLD.master_outline THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.master_outline';
  END IF;
  IF NEW.detailed_outline IS DISTINCT FROM OLD.detailed_outline THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.detailed_outline';
  END IF;
  IF NEW.characters IS DISTINCT FROM OLD.characters THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.characters';
  END IF;
  IF NEW.settings IS DISTINCT FROM OLD.settings THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.settings';
  END IF;
  IF NEW.chapters IS DISTINCT FROM OLD.chapters THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.chapters';
  END IF;
  IF NEW.final_script IS DISTINCT FROM OLD.final_script THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.final_script';
  END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.started_at';
  END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.completed_at';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_tasks_sensitive_columns()
IS 'Blocks non-service-role callers from modifying pipeline-managed task columns. Users can only modify: name, input_data.';
