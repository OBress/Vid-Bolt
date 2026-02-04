-- ============================================================================
-- Video Editor V2 Tables
-- ============================================================================
-- Creates tables for the video editor media library and project state persistence.
-- Part of the Video Editor V2 backend integration.

-- ============================================================================
-- 1. video_editor_media - Stores media file metadata for the editor's asset library
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_editor_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES video_projects(id) ON DELETE SET NULL,
  s3_key TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('video', 'image', 'audio')),
  size BIGINT NOT NULL,
  duration FLOAT,
  thumbnail TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_video_editor_media_user ON video_editor_media(user_id);
CREATE INDEX IF NOT EXISTS idx_video_editor_media_project ON video_editor_media(project_id);
CREATE INDEX IF NOT EXISTS idx_video_editor_media_user_project ON video_editor_media(user_id, project_id);

-- Enable RLS
ALTER TABLE video_editor_media ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own media
CREATE POLICY "Users can view their own media"
  ON video_editor_media FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own media"
  ON video_editor_media FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own media"
  ON video_editor_media FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass for admin operations
CREATE POLICY "Service role full access on video_editor_media"
  ON video_editor_media FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 2. video_project_state - Stores timeline and editor state for projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS video_project_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES video_projects(id) ON DELETE CASCADE,
  research_data JSONB DEFAULT '{}',
  script_data JSONB DEFAULT '{}',
  voice_data JSONB DEFAULT '{}',
  timeline_data JSONB DEFAULT '{}',
  export_settings JSONB DEFAULT '{}',
  editor_preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for project lookup
CREATE INDEX IF NOT EXISTS idx_video_project_state_project ON video_project_state(project_id);

-- Enable RLS
ALTER TABLE video_project_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access state for their own projects
-- This requires joining to video_projects to check ownership
CREATE POLICY "Users can view state for their own projects"
  ON video_project_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM video_projects
      WHERE video_projects.id = video_project_state.project_id
      AND video_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert state for their own projects"
  ON video_project_state FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM video_projects
      WHERE video_projects.id = video_project_state.project_id
      AND video_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update state for their own projects"
  ON video_project_state FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM video_projects
      WHERE video_projects.id = video_project_state.project_id
      AND video_projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete state for their own projects"
  ON video_project_state FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM video_projects
      WHERE video_projects.id = video_project_state.project_id
      AND video_projects.user_id = auth.uid()
    )
  );

-- Service role bypass for service operations
CREATE POLICY "Service role full access on video_project_state"
  ON video_project_state FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. Trigger for updated_at
-- ============================================================================

-- Create update trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_video_project_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS video_project_state_updated_at ON video_project_state;
CREATE TRIGGER video_project_state_updated_at
  BEFORE UPDATE ON video_project_state
  FOR EACH ROW
  EXECUTE FUNCTION update_video_project_state_updated_at();

-- ============================================================================
-- Done
-- ============================================================================
