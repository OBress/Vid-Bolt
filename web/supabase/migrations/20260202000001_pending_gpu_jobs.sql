-- Migration: Add pending_gpu_jobs table for VM readiness orchestration
-- This table stores GPU jobs that are waiting for the VM to become ready

CREATE TABLE IF NOT EXISTS public.pending_gpu_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.video_projects(id) ON DELETE CASCADE,
  
  -- Job Classification
  job_type TEXT NOT NULL CHECK (job_type IN (
    'asset_reference_images',
    'image_generation',
    'image_editing',
    'video_generation'
  )),
  
  -- Target Queue (for dispatch routing)
  target_queue TEXT NOT NULL CHECK (target_queue IN (
    'asset-reference-images',
    'gpu-image-create',
    'gpu-image-edit',
    'gpu-ltx2-create'
  )),
  
  -- Job payload (queue-specific data)
  job_data JSONB NOT NULL,
  
  -- Tracking
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  priority INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'failed', 'expired')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  error_message TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_pending_gpu_jobs_user_status ON public.pending_gpu_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_gpu_jobs_expires ON public.pending_gpu_jobs(expires_at) WHERE status = 'pending';

-- Enable Row Level Security
ALTER TABLE public.pending_gpu_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own pending jobs
CREATE POLICY "Users manage own pending jobs" ON public.pending_gpu_jobs
  FOR ALL USING (auth.uid() = user_id);

-- Grant access to service role for backend operations
GRANT ALL ON public.pending_gpu_jobs TO service_role;

-- Add comment for documentation
COMMENT ON TABLE public.pending_gpu_jobs IS 'Stores GPU jobs waiting for VM readiness. Jobs are dispatched automatically when VM becomes ready via GCP startup webhook.';
