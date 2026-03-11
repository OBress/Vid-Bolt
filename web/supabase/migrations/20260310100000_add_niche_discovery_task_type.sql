-- Add 'niche_discovery' to the tasks type check constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check
  CHECK (type IN (
    'writing', 'writing_workflow', 'audio', 'video', 'export',
    'outline', 'script_writing', 'av_script_part1', 'av_script_part2',
    'edit_assembly', 'closed_loop', 'niche_discovery'
  ));
