-- Migration: YouTube Shot Plans
-- Admin-only table for storing Gemini-powered shot-by-shot video analyses.
-- Used to compare studio-grade production techniques with Vid-Bolt's output.

CREATE TABLE IF NOT EXISTS public.yt_shot_plans (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at         TIMESTAMPTZ DEFAULT now() NOT NULL,

  -- Video metadata
  youtube_video_id   TEXT NOT NULL,
  youtube_url        TEXT NOT NULL,
  video_title        TEXT NOT NULL,
  channel_name       TEXT NOT NULL,
  channel_id         TEXT,
  thumbnail_url      TEXT,
  duration_seconds   INT,
  published_at       TIMESTAMPTZ,

  -- Analysis output
  summary            TEXT NOT NULL DEFAULT '',
  shot_plan          JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_shots        INT DEFAULT 0,
  analysis_model     TEXT DEFAULT 'google/gemini-2.5-flash-preview',

  -- Organisation
  category           TEXT,
  notes              TEXT,

  -- Batch tracking (for channel scrapes)
  source_type        TEXT NOT NULL DEFAULT 'single'
    CHECK (source_type IN ('single', 'channel_batch')),
  batch_id           UUID,

  -- Admin provenance
  created_by         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE
);

-- Timestamps trigger
CREATE TRIGGER handle_yt_shot_plans_updated_at
  BEFORE UPDATE ON public.yt_shot_plans
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime('updated_at');

-- Row Level Security — admin only
ALTER TABLE public.yt_shot_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "yt_shot_plans_admin_only"
  ON public.yt_shot_plans
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_yt_shot_plans_created_by   ON public.yt_shot_plans (created_by);
CREATE INDEX IF NOT EXISTS idx_yt_shot_plans_category     ON public.yt_shot_plans (category);
CREATE INDEX IF NOT EXISTS idx_yt_shot_plans_channel_id   ON public.yt_shot_plans (channel_id);
CREATE INDEX IF NOT EXISTS idx_yt_shot_plans_batch_id     ON public.yt_shot_plans (batch_id);
CREATE INDEX IF NOT EXISTS idx_yt_shot_plans_created_at   ON public.yt_shot_plans (created_at DESC);
