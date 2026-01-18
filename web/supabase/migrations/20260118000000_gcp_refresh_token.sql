-- Add refresh token column for persistent GCP authentication
-- This allows the server to refresh access tokens without user re-authentication

ALTER TABLE public.user_gcp_config 
ADD COLUMN IF NOT EXISTS gcp_refresh_token TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.user_gcp_config.gcp_refresh_token IS 'Encrypted Google OAuth refresh token for persistent GCP API access';

-- Add token_expires_at to track access token expiry (optional optimization)
ALTER TABLE public.user_gcp_config 
ADD COLUMN IF NOT EXISTS gcp_token_expires_at TIMESTAMPTZ;
