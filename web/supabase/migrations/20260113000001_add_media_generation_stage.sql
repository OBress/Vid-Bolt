-- ============================================================================
-- Migration: Rename images stage to media, add media generation phases
-- ============================================================================
-- Description: Updates video_projects to use 'media' stage instead of 'images'
-- and ensures tasks table supports media generation phases.
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP the existing constraint FIRST (before any data changes)
-- ============================================================================
ALTER TABLE public.video_projects DROP CONSTRAINT IF EXISTS video_projects_current_stage_check;

-- ============================================================================
-- STEP 2: Migrate existing 'images' stage records to 'media'
-- ============================================================================
UPDATE public.video_projects 
SET current_stage = 'media' 
WHERE current_stage = 'images';

-- ============================================================================
-- STEP 3: Add the updated constraint with 'media' stage
-- ============================================================================
ALTER TABLE public.video_projects ADD CONSTRAINT video_projects_current_stage_check 
CHECK (
  "current_stage" = ANY (ARRAY[
    'idea'::text, 
    'script'::text, 
    'audio'::text, 
    'media'::text,
    'video'::text, 
    'export'::text, 
    'completed'::text
  ])
);

-- ============================================================================
-- STEP 4: Add comment documenting the media generation metadata schema
-- ============================================================================
COMMENT ON COLUMN public.video_projects.metadata IS 
'Flexible JSONB storage for video-specific data. 
Media generation progress stored in metadata.media_generation: {
  status: "pending"|"av_script"|"images"|"image_edits"|"videos"|"completed"|"failed",
  started_at, completed_at, error,
  total_shots, current_shot_index, current_phase,
  images_completed, images_failed,
  edits_completed, edits_failed, edits_skipped,
  videos_completed, videos_failed
}';

-- ============================================================================
-- Migration complete
-- ============================================================================
