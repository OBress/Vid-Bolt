-- ============================================================================
-- Migration: Fix RLS auth.uid() InitPlan Performance
-- ============================================================================
-- Description: Optimizes RLS policies by wrapping auth.uid() calls in 
-- subqueries (select auth.uid()) to prevent per-row re-evaluation.
-- Also consolidates multiple permissive SELECT policies on video_projects.
-- ============================================================================

-- ============================================================================
-- Fix policies for: public.users
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" 
ON public.users FOR SELECT 
USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" 
ON public.users FOR UPDATE 
USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile" 
ON public.users FOR INSERT 
WITH CHECK ((select auth.uid()) = id);

-- ============================================================================
-- Fix policies for: public.user_api_keys
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own keys" ON public.user_api_keys;
CREATE POLICY "Users can view own keys" ON public.user_api_keys
    FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own keys" ON public.user_api_keys;
CREATE POLICY "Users can insert own keys" ON public.user_api_keys
    FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own keys" ON public.user_api_keys;
CREATE POLICY "Users can update own keys" ON public.user_api_keys
    FOR UPDATE USING ((select auth.uid()) = user_id);

-- ============================================================================
-- Fix policies for: public.media_projects
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage their own media projects" ON public.media_projects;
CREATE POLICY "Users can manage their own media projects" 
ON public.media_projects 
FOR ALL 
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================
-- Fix policies for: public.project_settings
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage settings for their owned projects" ON public.project_settings;
CREATE POLICY "Users can manage settings for their owned projects" 
ON public.project_settings 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.media_projects 
        WHERE public.media_projects.id = public.project_settings.project_id 
        AND public.media_projects.user_id = (select auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.media_projects 
        WHERE public.media_projects.id = public.project_settings.project_id 
        AND public.media_projects.user_id = (select auth.uid())
    )
);

-- ============================================================================
-- Fix policies for: public.user_settings
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage their own general settings" ON public.user_settings;
CREATE POLICY "Users can manage their own general settings" 
ON public.user_settings 
FOR ALL 
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================
-- Fix policies for: public.tasks
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage their own tasks" ON public.tasks;
CREATE POLICY "Users can manage their own tasks"
    ON public.tasks
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

-- ============================================================================
-- Fix policies for: public.task_steps
-- ============================================================================

DROP POLICY IF EXISTS "Users can view steps for their own tasks" ON public.task_steps;
CREATE POLICY "Users can view steps for their own tasks"
    ON public.task_steps
    USING (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = task_steps.task_id
        AND tasks.user_id = (select auth.uid())
    ));

-- ============================================================================
-- Fix policies for: public.continuity_state
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage their own continuity state" ON public.continuity_state;
CREATE POLICY "Users can manage their own continuity state"
    ON public.continuity_state
    USING (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = continuity_state.task_id
        AND tasks.user_id = (select auth.uid())
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.tasks
        WHERE tasks.id = continuity_state.task_id
        AND tasks.user_id = (select auth.uid())
    ));

-- ============================================================================
-- Fix policies for: public.video_projects
-- Drop both SELECT policies and consolidate into one combined policy
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage their own video projects" ON public.video_projects;
DROP POLICY IF EXISTS "Users can view videos in owned media projects" ON public.video_projects;

-- Create a single SELECT policy that combines both conditions
CREATE POLICY "Users can view their own video projects"
ON public.video_projects
FOR SELECT
USING (
    (select auth.uid()) = user_id
    OR (
        project_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 FROM public.media_projects
            WHERE media_projects.id = video_projects.project_id
            AND media_projects.user_id = (select auth.uid())
        )
    )
);

-- Create separate policies for INSERT, UPDATE, DELETE (only user_id check)
CREATE POLICY "Users can insert their own video projects"
ON public.video_projects
FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own video projects"
ON public.video_projects
FOR UPDATE
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own video projects"
ON public.video_projects
FOR DELETE
USING ((select auth.uid()) = user_id);

-- ============================================================================
-- Fix policies for: public.user_gcp_config
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own config" ON public.user_gcp_config;
CREATE POLICY "Users can view their own config"
  ON public.user_gcp_config FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own config" ON public.user_gcp_config;
CREATE POLICY "Users can insert their own config"
  ON public.user_gcp_config FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own config" ON public.user_gcp_config;
CREATE POLICY "Users can update their own config"
  ON public.user_gcp_config FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own config" ON public.user_gcp_config;
CREATE POLICY "Users can delete their own config"
  ON public.user_gcp_config FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- Fix policies for: public.monthly_statements (if table exists)
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'monthly_statements') THEN
        -- Drop and recreate policies with optimized auth.uid() calls
        DROP POLICY IF EXISTS "Users can view their own statements" ON public.monthly_statements;
        DROP POLICY IF EXISTS "Users can insert their own statements" ON public.monthly_statements;
        DROP POLICY IF EXISTS "Users can update their own statements" ON public.monthly_statements;
        
        EXECUTE 'CREATE POLICY "Users can view their own statements"
            ON public.monthly_statements FOR SELECT
            USING ((select auth.uid()) = user_id)';
            
        EXECUTE 'CREATE POLICY "Users can insert their own statements"
            ON public.monthly_statements FOR INSERT
            WITH CHECK ((select auth.uid()) = user_id)';
            
        EXECUTE 'CREATE POLICY "Users can update their own statements"
            ON public.monthly_statements FOR UPDATE
            USING ((select auth.uid()) = user_id)';
    END IF;
END $$;

-- ============================================================================
-- Migration complete
-- ============================================================================
