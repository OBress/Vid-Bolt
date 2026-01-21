-- ============================================================================
-- Add av_script_part1 task type for Step 4→5 transition
-- ============================================================================
-- This task type is used when generating the AV script shot breakdown
-- during the transition from Audio (Step 4) to Shot Creation (Step 5)
-- ============================================================================

-- Update constraint to include new task type
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check 
  CHECK (type = ANY (ARRAY['writing', 'writing_workflow', 'audio', 'video', 'export', 'outline', 'script_writing', 'av_script_part1']));
