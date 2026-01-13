-- Migration: Add images stage to video_projects constraint

-- Drop the existing constraint
ALTER TABLE public.video_projects DROP CONSTRAINT IF EXISTS video_projects_current_stage_check;

-- Add the updated constraint with images included
ALTER TABLE public.video_projects ADD CONSTRAINT video_projects_current_stage_check 
CHECK (
  "current_stage" = ANY (ARRAY[
    'idea'::text, 
    'script'::text, 
    'audio'::text, 
    'images'::text, 
    'video'::text, 
    'export'::text, 
    'completed'::text
  ])
);
