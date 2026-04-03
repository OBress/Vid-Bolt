-- ============================================================================
-- Migration: Add segmentation phase to tasks constraint
-- ============================================================================
-- The SAM 3 segmentation workers use 'segmentation' as current_phase.
-- Add it to the tasks_current_phase_check constraint.
-- ============================================================================

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_current_phase_check;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_current_phase_check
  CHECK (
    current_phase IS NULL
    OR current_phase = ANY (ARRAY[
      -- Original phases
      'preprocessing', 'writing', 'postprocessing',
      'audio_generation', 'audio_processing',
      'image_generation', 'image_editing',
      'video_generation', 'compositing',
      'encoding', 'uploading',
      -- Universal script phases
      'research', 'scoping', 'spine',
      'assets', 'expansion', 'assembly',
      -- Segmentation (SAM 3)
      'segmentation'
    ])
  );
