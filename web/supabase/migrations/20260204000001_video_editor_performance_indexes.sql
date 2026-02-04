-- ============================================================================
-- Video Editor V2 - Performance Indexes
-- ============================================================================
-- Adds indexes for faster ordering and common query patterns.
-- Note: Using regular CREATE INDEX (not CONCURRENTLY) for migration compatibility.

-- Index for faster ordering by created_at (descending for most recent first)
CREATE INDEX IF NOT EXISTS idx_video_editor_media_created_at 
  ON video_editor_media(created_at DESC);

-- Composite index for common query pattern: user + project + ordered by date
CREATE INDEX IF NOT EXISTS idx_video_editor_media_user_project_date 
  ON video_editor_media(user_id, project_id, created_at DESC);
