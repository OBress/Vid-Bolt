-- Migration: Add image_editing phase to tasks constraint
-- This allows the GPU API tester to use image_editing as a current_phase value

-- Drop the existing constraint
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_current_phase_check;

-- Add the updated constraint with image_editing included
ALTER TABLE public.tasks ADD CONSTRAINT tasks_current_phase_check 
CHECK (
  current_phase IS NULL 
  OR current_phase = ANY (ARRAY[
    'preprocessing'::text, 
    'writing'::text, 
    'postprocessing'::text, 
    'audio_generation'::text, 
    'audio_processing'::text, 
    'image_generation'::text, 
    'image_editing'::text,
    'video_generation'::text, 
    'compositing'::text, 
    'encoding'::text, 
    'uploading'::text
  ])
);
