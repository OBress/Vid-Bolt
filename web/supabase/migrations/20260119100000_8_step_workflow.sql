-- ============================================================================
-- Migration: 8-Step Video Creation Workflow
-- ============================================================================
-- Description: Updates video_projects to support the new 8-step workflow.
-- Adds stages: 'outline', 'stock', 'shot_planning', 'shot_creation'.
-- Migrates existing data to map to new stages.
-- ============================================================================

-- ============================================================================
-- STEP 1: DROP the existing constraint
-- ============================================================================
ALTER TABLE public.video_projects DROP CONSTRAINT IF EXISTS video_projects_current_stage_check;

-- ============================================================================
-- STEP 2: Migrate existing data to new stages
-- ============================================================================
-- 1. Migrate 'idea' (Step 1) -> 'outline' (Step 1)
UPDATE public.video_projects 
SET current_stage = 'outline' 
WHERE current_stage = 'idea';

-- 2. Migrate 'media' (Step 4 old) -> 'shot_planning' (Step 5 new)
-- Note: 'media' was the general media stage. We map it to the start of the new media block.
UPDATE public.video_projects 
SET current_stage = 'shot_planning' 
WHERE current_stage = 'media';

-- ============================================================================
-- STEP 3: Add the updated constraint with ALL new stages
-- ============================================================================
ALTER TABLE public.video_projects ADD CONSTRAINT video_projects_current_stage_check 
CHECK (
  "current_stage" = ANY (ARRAY[
    'outline'::text,        -- Step 1
    'stock'::text,          -- Step 2
    'script'::text,         -- Step 3
    'audio'::text,          -- Step 4
    'shot_planning'::text,  -- Step 5
    'shot_creation'::text,  -- Step 6
    'video'::text,          -- Step 7 (Editor)
    'export'::text,         -- Step 8
    'completed'::text,
    'idea'::text            -- Kept for safety/backwards compat if needed, though we migrated away
  ])
);

-- ============================================================================
-- STEP 4: Update comment documenting the new stages
-- ============================================================================
COMMENT ON COLUMN public.video_projects.current_stage IS 
'Current pipeline stage: outline, stock, script, audio, shot_planning, shot_creation, video, export, completed';

-- ============================================================================
-- Migration complete
-- ============================================================================
