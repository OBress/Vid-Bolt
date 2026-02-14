-- Migration: Add 'edit_assembly' to the tasks type check constraint
-- Required for the Step 6→7 EDL generation workflow

-- Update constraint to include edit_assembly task type
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check 
  CHECK (type IN (
    'writing', 
    'writing_workflow', 
    'audio', 
    'video', 
    'export', 
    'outline', 
    'script_writing', 
    'av_script_part1', 
    'av_script_part2',
    'edit_assembly'
  ));
