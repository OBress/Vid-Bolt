-- ============================================================================
-- Add av_script_part2 task type for Step 5→6 transition
-- ============================================================================
-- This task type is used when generating detailed visual prompts and
-- placeholder media during the transition from Shot Creation (Step 5) 
-- to Scene Review (Step 6)
-- ============================================================================

-- Update constraint to include new task type
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check 
  CHECK (type = ANY (ARRAY['writing', 'writing_workflow', 'audio', 'video', 'export', 'outline', 'script_writing', 'av_script_part1', 'av_script_part2']));
