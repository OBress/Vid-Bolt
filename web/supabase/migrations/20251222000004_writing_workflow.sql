-- Migration: Writing Workflow Schema
-- This migration creates tables for managing background writing tasks,
-- step-by-step progress tracking, and generated content storage.

-- ============================================================================
-- TASKS TABLE: High-level job tracking for writing workflows
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.media_projects(id) ON DELETE SET NULL,
    
    -- Task identification
    type TEXT NOT NULL DEFAULT 'writing_workflow',
    name TEXT NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    current_phase TEXT CHECK (current_phase IN ('preprocessing', 'writing', 'postprocessing')),
    current_step TEXT,
    progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    
    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Inngest integration
    inngest_run_id TEXT,
    
    -- Metadata
    input_data JSONB DEFAULT '{}'::JSONB,
    output_data JSONB DEFAULT '{}'::JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- TASK_STEPS TABLE: Granular step-by-step progress tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.task_steps (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    
    -- Step identification
    phase TEXT NOT NULL CHECK (phase IN ('preprocessing', 'writing', 'postprocessing')),
    step_name TEXT NOT NULL,
    step_order INTEGER NOT NULL,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    
    -- Step data
    input_data JSONB DEFAULT '{}'::JSONB,
    output_data JSONB DEFAULT '{}'::JSONB,
    error_message TEXT,
    
    -- Performance metrics
    duration_ms INTEGER,
    token_count INTEGER,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- WRITING_CONTENT TABLE: Generated content storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.writing_content (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.media_projects(id) ON DELETE SET NULL,
    
    -- Content type
    content_type TEXT NOT NULL CHECK (content_type IN (
        'research',
        'master_outline',
        'chapter_outline',
        'character',
        'setting',
        'chapter',
        'final_script'
    )),
    
    -- Content identification (for chapters, etc.)
    chapter_number INTEGER,
    version INTEGER DEFAULT 1,
    
    -- The actual content
    title TEXT,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::JSONB,
    
    -- Quality tracking
    quality_score NUMERIC(3,2),
    is_approved BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- CONTINUITY_STATE TABLE: State management for writing loop
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.continuity_state (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    
    -- Current state
    current_chapter INTEGER NOT NULL DEFAULT 0,
    total_chapters INTEGER NOT NULL DEFAULT 1,
    
    -- Continuity data
    events JSONB DEFAULT '[]'::JSONB,           -- List of story events
    characters JSONB DEFAULT '{}'::JSONB,       -- Character states
    settings JSONB DEFAULT '{}'::JSONB,         -- Setting states
    plot_points JSONB DEFAULT '[]'::JSONB,      -- Major plot points
    
    -- Synopsis and context
    story_synopsis TEXT,
    previous_chapter_summary TEXT,
    future_chapter_hints TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(task_id)
);

-- ============================================================================
-- INDEXES for performance at scale
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON public.tasks(user_id, status);

CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON public.task_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_task_steps_status ON public.task_steps(status);

CREATE INDEX IF NOT EXISTS idx_writing_content_task_id ON public.writing_content(task_id);
CREATE INDEX IF NOT EXISTS idx_writing_content_project_id ON public.writing_content(project_id);
CREATE INDEX IF NOT EXISTS idx_writing_content_type ON public.writing_content(content_type);

-- ============================================================================
-- TRIGGERS for updated_at
-- ============================================================================
CREATE OR REPLACE TRIGGER set_updated_at_tasks
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_writing_content
    BEFORE UPDATE ON public.writing_content
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at_continuity_state
    BEFORE UPDATE ON public.continuity_state
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuity_state ENABLE ROW LEVEL SECURITY;

-- Tasks: Users can only manage their own tasks
CREATE POLICY "Users can manage their own tasks"
    ON public.tasks
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Task Steps: Users can view steps for their own tasks
CREATE POLICY "Users can view steps for their own tasks"
    ON public.task_steps
    USING (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = task_steps.task_id
        AND tasks.user_id = auth.uid()
    ));

-- Writing Content: Users can manage content for their own tasks
CREATE POLICY "Users can manage their own writing content"
    ON public.writing_content
    USING (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = writing_content.task_id
        AND tasks.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = writing_content.task_id
        AND tasks.user_id = auth.uid()
    ));

-- Continuity State: Users can manage state for their own tasks
CREATE POLICY "Users can manage their own continuity state"
    ON public.continuity_state
    USING (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = continuity_state.task_id
        AND tasks.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = continuity_state.task_id
        AND tasks.user_id = auth.uid()
    ));

-- ============================================================================
-- GRANTS for authenticated users
-- ============================================================================
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.task_steps TO authenticated;
GRANT ALL ON TABLE public.writing_content TO authenticated;
GRANT ALL ON TABLE public.continuity_state TO authenticated;

GRANT ALL ON TABLE public.tasks TO service_role;
GRANT ALL ON TABLE public.task_steps TO service_role;
GRANT ALL ON TABLE public.writing_content TO service_role;
GRANT ALL ON TABLE public.continuity_state TO service_role;
