-- Data Retention Cleanup
-- ============================================================================
-- Adds columns to video_projects for tracking cleanup status and preserving
-- a thumbnail URL after media deletion.

-- Cleanup tracking columns
ALTER TABLE video_projects ADD COLUMN IF NOT EXISTS cleanup_status TEXT;
ALTER TABLE video_projects ADD COLUMN IF NOT EXISTS cleaned_at TIMESTAMPTZ;
ALTER TABLE video_projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Partial index for efficient expired-video queries
-- Only indexes videos that haven't been cleaned yet and are in a terminal state
CREATE INDEX IF NOT EXISTS idx_video_projects_cleanup
  ON video_projects (created_at)
  WHERE cleanup_status IS NULL
    AND status IN ('completed', 'failed', 'cancelled');

COMMENT ON COLUMN video_projects.cleanup_status IS 'Set to ''cleaned'' after data retention cleanup has processed this video';
COMMENT ON COLUMN video_projects.cleaned_at IS 'Timestamp when data retention cleanup was performed';
COMMENT ON COLUMN video_projects.thumbnail_url IS 'Preserved thumbnail URL for display after cleanup deletes all other media';
