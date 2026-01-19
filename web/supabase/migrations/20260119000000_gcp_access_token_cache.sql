-- Add gcp_access_token column to cache the access token
-- This prevents unnecessary token refresh calls on every API request

ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS gcp_access_token TEXT;

COMMENT ON COLUMN public.user_gcp_config.gcp_access_token IS 'Cached Google OAuth access token (expires after 1 hour)';
