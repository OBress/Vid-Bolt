-- ============================================================================
-- Video Projects Migration
-- ============================================================================
-- Description: Create video_projects table to track individual videos through
-- the production pipeline (idea → script → audio → video → export)
-- ============================================================================

-- ============================================================================
-- STEP 1: Create video_projects table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.video_projects (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.media_projects(id) ON DELETE SET NULL,
    
    -- Basic info
    name TEXT NOT NULL,
    description TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'draft',
    current_stage TEXT NOT NULL DEFAULT 'idea',
    current_step TEXT,
    progress_percent INT NOT NULL DEFAULT 0,
    
    -- Task references (linking to the tasks table for each pipeline stage)
    script_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    audio_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    video_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    export_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    
    -- Content tracking
    idea TEXT,
    script_content TEXT,
    audio_url TEXT,
    video_url TEXT,
    
    -- Flexible metadata storage
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT video_projects_status_check 
        CHECK (status = ANY (ARRAY['draft', 'processing', 'completed', 'failed', 'cancelled'])),
    CONSTRAINT video_projects_current_stage_check 
        CHECK (current_stage = ANY (ARRAY['idea', 'script', 'audio', 'video', 'export', 'completed'])),
    CONSTRAINT video_projects_progress_percent_check 
        CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

-- Add comments for documentation
COMMENT ON TABLE public.video_projects IS 'Individual video projects tracked through the production pipeline';
COMMENT ON COLUMN public.video_projects.status IS 'Overall video status: draft, processing, completed, failed, cancelled';
COMMENT ON COLUMN public.video_projects.current_stage IS 'Current pipeline stage: idea, script, audio, video, export, completed';
COMMENT ON COLUMN public.video_projects.metadata IS 'Flexible JSONB storage for video-specific data';

-- ============================================================================
-- STEP 2: Create indexes for efficient queries
-- ============================================================================

-- Index for user's videos
CREATE INDEX idx_video_projects_user_id ON public.video_projects (user_id);

-- Index for videos in a media project
CREATE INDEX idx_video_projects_project_id ON public.video_projects (project_id);

-- Index for filtering by status
CREATE INDEX idx_video_projects_status ON public.video_projects (status);

-- Index for filtering by current stage
CREATE INDEX idx_video_projects_current_stage ON public.video_projects (current_stage);

-- Composite index for common query pattern: user's videos by status
CREATE INDEX idx_video_projects_user_status ON public.video_projects (user_id, status);

-- Index for metadata queries
CREATE INDEX idx_video_projects_metadata ON public.video_projects USING GIN (metadata jsonb_path_ops);

-- Index for sorting by creation date
CREATE INDEX idx_video_projects_created_at ON public.video_projects (created_at DESC);

-- ============================================================================
-- STEP 3: Create helper functions
-- ============================================================================

-- Function: Update video progress tracking
-- Usage: SELECT update_video_progress('video-uuid', 'script', 'Writing chapter 1', 25);
CREATE OR REPLACE FUNCTION public.update_video_progress(
    p_video_id UUID,
    p_current_stage TEXT,
    p_current_step TEXT,
    p_progress_percent INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.video_projects
    SET 
        current_stage = p_current_stage,
        current_step = p_current_step,
        progress_percent = p_progress_percent,
        updated_at = now(),
        -- Auto-set status to processing if not already completed/failed
        status = CASE 
            WHEN status = 'draft' THEN 'processing'
            WHEN status IN ('completed', 'failed', 'cancelled') THEN status
            ELSE 'processing'
        END,
        -- Auto-set completed_at when stage is 'completed'
        completed_at = CASE
            WHEN p_current_stage = 'completed' THEN now()
            ELSE completed_at
        END
    WHERE id = p_video_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video project not found: %', p_video_id;
    END IF;
END;
$$;

-- Function: Link task to video project
-- Usage: SELECT link_task_to_video('video-uuid', 'task-uuid', 'script');
CREATE OR REPLACE FUNCTION public.link_task_to_video(
    p_video_id UUID,
    p_task_id UUID,
    p_task_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.video_projects
    SET 
        script_task_id = CASE WHEN p_task_type = 'script' THEN p_task_id ELSE script_task_id END,
        audio_task_id = CASE WHEN p_task_type = 'audio' THEN p_task_id ELSE audio_task_id END,
        video_task_id = CASE WHEN p_task_type = 'video' THEN p_task_id ELSE video_task_id END,
        export_task_id = CASE WHEN p_task_type = 'export' THEN p_task_id ELSE export_task_id END,
        updated_at = now()
    WHERE id = p_video_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video project not found: %', p_video_id;
    END IF;
END;
$$;

-- Function: Get incomplete videos for a user (for resume functionality)
-- Usage: SELECT * FROM get_incomplete_videos('user-uuid');
CREATE OR REPLACE FUNCTION public.get_incomplete_videos(p_user_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    status TEXT,
    current_stage TEXT,
    current_step TEXT,
    progress_percent INT,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vp.id,
        vp.name,
        vp.status,
        vp.current_stage,
        vp.current_step,
        vp.progress_percent,
        vp.updated_at
    FROM public.video_projects vp
    WHERE 
        vp.user_id = p_user_id
        AND vp.status IN ('draft', 'processing', 'failed')
        AND vp.current_stage != 'completed'
    ORDER BY vp.updated_at DESC;
END;
$$;

-- ============================================================================
-- STEP 4: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.video_projects ENABLE ROW LEVEL SECURITY;

-- Policy: Users can manage their own video projects
CREATE POLICY "Users can manage their own video projects"
ON public.video_projects
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view videos in media projects they own
CREATE POLICY "Users can view videos in owned media projects"
ON public.video_projects
FOR SELECT
USING (
    project_id IS NULL 
    OR EXISTS (
        SELECT 1 FROM public.media_projects
        WHERE media_projects.id = video_projects.project_id
        AND media_projects.user_id = auth.uid()
    )
);

-- ============================================================================
-- STEP 5: Grant permissions on functions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.update_video_progress(UUID, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_video_progress(UUID, TEXT, TEXT, INT) TO service_role;

GRANT EXECUTE ON FUNCTION public.link_task_to_video(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_task_to_video(UUID, UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_incomplete_videos(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_incomplete_videos(UUID) TO service_role;

-- ============================================================================
-- STEP 6: Create trigger for updated_at
-- ============================================================================

CREATE TRIGGER set_updated_at_video_projects
BEFORE UPDATE ON public.video_projects
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- Migration complete
-- ============================================================================
