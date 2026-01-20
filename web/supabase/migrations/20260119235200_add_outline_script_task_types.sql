-- ============================================================================
-- Add outline and script_writing task types for new video creation workflow
-- ============================================================================
-- Step 1 uses 'outline' tasks for generating spine, assets, and research
-- Step 3 uses 'script_writing' tasks for generating the final script
-- ============================================================================

-- Update constraint to include new task types
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check 
  CHECK (type = ANY (ARRAY['writing', 'writing_workflow', 'audio', 'video', 'export', 'outline', 'script_writing']));
