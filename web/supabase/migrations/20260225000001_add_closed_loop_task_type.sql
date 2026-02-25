-- Add 'closed_loop' to the tasks type check constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_type_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_type_check
  CHECK (type = ANY (ARRAY[
    'writing'::text, 'writing_workflow'::text, 'audio'::text, 'video'::text,
    'export'::text, 'outline'::text, 'script_writing'::text,
    'av_script_part1'::text, 'av_script_part2'::text, 'edit_assembly'::text,
    'closed_loop'::text
  ]));
