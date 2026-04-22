-- Migration: Add LLM provider columns to user_api_keys
-- Adds inworld_router_key (LLM Router key, separate from TTS key)
-- and llm_provider (active provider preference, defaults to 'openrouter')

ALTER TABLE public.user_api_keys
  ADD COLUMN IF NOT EXISTS inworld_router_key TEXT,
  ADD COLUMN IF NOT EXISTS llm_provider TEXT DEFAULT 'openrouter';

COMMENT ON COLUMN public.user_api_keys.inworld_router_key IS
  'Inworld AI Router API key for LLM calls. Separate from inworld_tts_key for independent cost tracking.';

COMMENT ON COLUMN public.user_api_keys.llm_provider IS
  'Active LLM provider for this user: ''openrouter'' (default) or ''inworld''.';
