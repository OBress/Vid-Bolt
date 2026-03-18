-- Add GPU production shutdown tracking columns to user_gcp_config
-- Enables reference-counting of active GPU productions and
-- auto-shutdown when the last production completes.

ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS active_gpu_productions INTEGER DEFAULT 0;

ALTER TABLE public.user_gcp_config
ADD COLUMN IF NOT EXISTS shutdown_after_production_requested BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.user_gcp_config.active_gpu_productions IS 'Reference counter of active GPU productions for this user. Shutdown only fires when this reaches 0.';
COMMENT ON COLUMN public.user_gcp_config.shutdown_after_production_requested IS 'Whether the user has requested GPU auto-shutdown after all active productions complete.';

-- Atomic increment RPC to avoid race conditions with concurrent video starts
CREATE OR REPLACE FUNCTION public.increment_active_gpu_productions(p_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.user_gcp_config
  SET active_gpu_productions = COALESCE(active_gpu_productions, 0) + 1
  WHERE user_id = p_user_id;
$$;
