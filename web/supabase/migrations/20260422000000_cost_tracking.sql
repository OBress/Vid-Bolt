-- =============================================================================
-- Cost Tracking System Migration
-- =============================================================================
-- Run this against the Supabase SQL editor or via CLI.
-- Order matters: cost_events must be after video_projects and users.

-- ---------------------------------------------------------------------------
-- 1. cost_events — the central ledger table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cost_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  video_id     UUID REFERENCES public.video_projects(id) ON DELETE SET NULL,
  category     TEXT NOT NULL,
  -- 'llm' | 'tts' | 'gcp_vm' | 'aws_lambda' | 'r2_storage' | 'search_valyu' | 'search_serper'
  service      TEXT NOT NULL,
  -- 'openrouter' | 'inworld_router' | 'inworld_tts' | 'gcp' | 'aws' | 'cloudflare' | 'valyu' | 'serper'
  sub_label    TEXT,        -- model name, voice, search_type, etc.
  amount_usd   NUMERIC(12,8) NOT NULL,
  raw_units    JSONB,       -- { tokens, chars, seconds, queries, gb, etc. }
  is_estimated BOOLEAN NOT NULL DEFAULT false,
  note         TEXT,        -- e.g. "SPOT pricing estimate"
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient per-user and per-video queries
CREATE INDEX IF NOT EXISTS idx_cost_events_user_date
  ON public.cost_events(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_category
  ON public.cost_events(user_id, category, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_events_video
  ON public.cost_events(video_id)
  WHERE video_id IS NOT NULL;

-- RLS: Users can only read their own rows; only service_role can write
ALTER TABLE public.cost_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cost_events'
      AND policyname = 'user_read_own_cost_events'
  ) THEN
    CREATE POLICY "user_read_own_cost_events"
      ON public.cost_events FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Note: No INSERT policy for authenticated users — workers use service_role key

-- ---------------------------------------------------------------------------
-- 2. user_gcp_config — add VM session tracking columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_gcp_config
  ADD COLUMN IF NOT EXISTS vm_provisioned_at     TIMESTAMPTZ,   -- when VM was first provisioned
  ADD COLUMN IF NOT EXISTS vm_session_started_at TIMESTAMPTZ,   -- set on START, nulled on STOP
  ADD COLUMN IF NOT EXISTS total_vm_hours_run    NUMERIC(10,4) DEFAULT 0,  -- cumulative hours
  ADD COLUMN IF NOT EXISTS total_vm_days_owned   INTEGER DEFAULT 0;        -- cumulative days provisioned

-- ---------------------------------------------------------------------------
-- 3. admin_platform_costs — Hetzner, R2, and misc infrastructure costs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_platform_costs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month_date  DATE NOT NULL,  -- first of month, e.g. 2026-04-01
  category    TEXT NOT NULL,  -- 'hetzner' | 'r2' | 'misc'
  label       TEXT NOT NULL,
  amount_usd  NUMERIC(10,2) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month_date, category, label)
);

-- No RLS on admin_platform_costs — accessed only via service_role from admin API routes
