-- Add all legacy current_stage values back to the constraint
-- Workers like audio.ts still set current_stage to legacy values like 'audio'
-- when running within the closed-loop pipeline
ALTER TABLE video_projects DROP CONSTRAINT IF EXISTS video_projects_current_stage_check;
ALTER TABLE video_projects ADD CONSTRAINT video_projects_current_stage_check
  CHECK (current_stage IN (
    'idea', 'outline', 'stock', 'script', 'production',
    'audio', 'media', 'shot_planning', 'shot_creation',
    'video', 'export', 'completed'
  ));
