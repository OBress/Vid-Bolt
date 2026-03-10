-- Migration: Add YouTube OAuth columns to user_gcp_config
-- Run this in Supabase SQL Editor

ALTER TABLE user_gcp_config
  ADD COLUMN IF NOT EXISTS youtube_oauth_client_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_oauth_client_secret TEXT,
  ADD COLUMN IF NOT EXISTS youtube_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS youtube_access_token TEXT,
  ADD COLUMN IF NOT EXISTS youtube_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS youtube_oauth_verified BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN user_gcp_config.youtube_oauth_client_id IS 'Per-user OAuth Client ID from their own GCP project';
COMMENT ON COLUMN user_gcp_config.youtube_oauth_client_secret IS 'Per-user OAuth Client Secret from their own GCP project';
COMMENT ON COLUMN user_gcp_config.youtube_refresh_token IS 'YouTube refresh token obtained via per-user OAuth';
COMMENT ON COLUMN user_gcp_config.youtube_oauth_verified IS 'Whether the user has verified their OAuth setup';
