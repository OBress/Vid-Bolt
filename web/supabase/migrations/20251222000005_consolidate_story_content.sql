-- Migration: Consolidate Story Content
-- Adds dedicated columns to tasks table for all story elements.
-- This replaces the writing_content table approach for simpler, more efficient storage.

-- ============================================================================
-- ADD STORY CONTENT COLUMNS TO TASKS TABLE
-- Using TEXT for large content, JSONB for structured data
-- ============================================================================

ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS research TEXT,
ADD COLUMN IF NOT EXISTS master_outline JSONB,
ADD COLUMN IF NOT EXISTS detailed_outline JSONB,
ADD COLUMN IF NOT EXISTS characters JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]'::JSONB,
ADD COLUMN IF NOT EXISTS final_script TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.tasks.research IS 'Research notes for the story (plain text)';
COMMENT ON COLUMN public.tasks.master_outline IS 'JSON: {title, synopsis, chapters[{chapterNumber, title, summary, keyEvents[]}]}';
COMMENT ON COLUMN public.tasks.detailed_outline IS 'JSON: Enhanced chapter outlines with detailed beats';
COMMENT ON COLUMN public.tasks.characters IS 'JSON array: [{name, description, role, traits[]}]';
COMMENT ON COLUMN public.tasks.settings IS 'JSON array: [{name, description, significance}]';
COMMENT ON COLUMN public.tasks.chapters IS 'JSON array: [{chapterNumber, title, content}] - supports 15k+ word scripts';
COMMENT ON COLUMN public.tasks.final_script IS 'Final processed script ready for TTS (plain text)';

-- ============================================================================
-- DROP OBSOLETE TABLE
-- The writing_content table is no longer needed
-- ============================================================================

DROP TABLE IF EXISTS public.writing_content CASCADE;

-- ============================================================================
-- PERFORMANCE: Index for active tasks with content (optional)
-- ============================================================================

-- Index to quickly find tasks that have completed content (for retrieval)
CREATE INDEX IF NOT EXISTS idx_tasks_has_final_script 
    ON public.tasks(user_id) 
    WHERE final_script IS NOT NULL;
