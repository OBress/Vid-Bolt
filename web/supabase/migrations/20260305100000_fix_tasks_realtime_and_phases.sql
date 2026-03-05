-- ============================================================================
-- Migration: Fix tasks realtime subscription & phase constraint
-- ============================================================================
-- 1. Add tasks + video_projects to supabase_realtime publication
-- 2. Update tasks_current_phase_check to include universal script phases
-- ============================================================================

-- ============================================================================
-- PART 1: Enable realtime for tasks and video_projects
-- ============================================================================
-- The TaskStatusButton subscribes to postgres_changes on the tasks table,
-- but the table was never added to the supabase_realtime publication,
-- so events were silently dropped.

ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.video_projects;

-- ============================================================================
-- PART 2: Update current_phase constraint to include new phases
-- ============================================================================
-- The universal script pipeline uses phases (research, scoping, spine, assets,
-- expansion, assembly) that were defined in TypeScript but never added to the
-- DB constraint. Workers currently use 'preprocessing'/'writing' as workarounds
-- but the correct phases should be allowed.

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
      'assets', 'expansion', 'assembly'
    ])
  );
