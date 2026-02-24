-- Migration: Consolidate 8-step workflow to 5-step workflow
-- Removes stages: audio, shot_planning, shot_creation
-- Migrates existing videos on removed stages back to 'script' stage

-- Step 1: Migrate existing videos on removed stages to 'script'
UPDATE video_projects 
SET current_stage = 'script', updated_at = NOW()
WHERE current_stage IN ('audio', 'shot_planning', 'shot_creation');

-- Step 2: Drop the old check constraint
ALTER TABLE video_projects DROP CONSTRAINT IF EXISTS video_projects_current_stage_check;

-- Step 3: Add new constraint with 5-step stages
ALTER TABLE video_projects ADD CONSTRAINT video_projects_current_stage_check
  CHECK (current_stage IN ('idea', 'outline', 'stock', 'script', 'video', 'export', 'completed'));

-- Step 4: Update column comment
COMMENT ON COLUMN video_projects.current_stage IS '5-step workflow: idea → outline → stock → script → video → export → completed';
