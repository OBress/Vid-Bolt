-- ============================================================================
-- Fix: Allow both old and new task types during migration
-- ============================================================================
-- This allows 'writing_workflow' (old) and 'writing' (new) to coexist
-- until all tasks are migrated.
-- ============================================================================

-- Update constraint to include both old and new task types
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check 
  CHECK (type = ANY (ARRAY['writing', 'writing_workflow', 'audio', 'video', 'export']));
