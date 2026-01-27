-- Add GPU auto-shutdown timer columns to user_gcp_config
-- Allows users to configure automatic VM shutdown after a period of inactivity

ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS gpu_auto_shutdown_minutes INTEGER DEFAULT 60;

ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS last_gpu_activity_at TIMESTAMPTZ DEFAULT now();

-- Add check constraint to enforce valid range (10-600 minutes)
ALTER TABLE public.user_gcp_config
ADD CONSTRAINT gpu_auto_shutdown_minutes_range 
CHECK (gpu_auto_shutdown_minutes >= 10 AND gpu_auto_shutdown_minutes <= 600);

COMMENT ON COLUMN public.user_gcp_config.gpu_auto_shutdown_minutes IS 'Minutes of GPU API inactivity before auto-shutdown (10-600)';
COMMENT ON COLUMN public.user_gcp_config.last_gpu_activity_at IS 'Timestamp of last GPU API call for auto-shutdown tracking';
