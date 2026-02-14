-- ============================================================================
-- Render Jobs Table
-- ============================================================================
-- Tracks video render jobs submitted to the Remotion Lambda pipeline.
-- Used by the render API and worker to manage render lifecycle.
--
-- Status flow: queued → rendering → completed / failed
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,

  -- BullMQ reference
  bullmq_job_id TEXT,

  -- Render state
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'rendering', 'completed', 'failed')),

  -- Remotion Lambda references
  render_id TEXT,           -- Remotion renderId
  bucket_name TEXT,         -- S3 bucket used by Lambda
  output_key TEXT,          -- R2 output key (renders/{userId}/{videoId}/{ts}.mp4)

  -- Result
  output_url TEXT,          -- Final public URL of rendered video
  output_size_bytes BIGINT, -- File size in bytes
  error_message TEXT,       -- Error details if failed

  -- Render metadata
  composition_id TEXT DEFAULT 'VideoComposition',
  width INT,
  height INT,
  fps INT,
  duration_frames INT,

  -- Cost tracking
  cost_accrued NUMERIC(10, 6),  -- AWS Lambda cost in USD
  cost_display TEXT,             -- Human-readable cost string

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_render_jobs_user_id ON public.render_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_video_id ON public.render_jobs(video_id);
CREATE INDEX IF NOT EXISTS idx_render_jobs_status ON public.render_jobs(status);
CREATE INDEX IF NOT EXISTS idx_render_jobs_created_at ON public.render_jobs(created_at DESC);

-- RLS policies (drop first for idempotency)
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own render jobs" ON public.render_jobs;
CREATE POLICY "Users can view own render jobs"
  ON public.render_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access to render jobs" ON public.render_jobs;
CREATE POLICY "Service role full access to render jobs"
  ON public.render_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_render_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_render_jobs_updated_at ON public.render_jobs;
CREATE TRIGGER trigger_render_jobs_updated_at
  BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_render_jobs_updated_at();
