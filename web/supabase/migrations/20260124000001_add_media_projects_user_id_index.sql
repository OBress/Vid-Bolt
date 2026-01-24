-- Add missing index on media_projects.user_id foreign key
-- Improves RLS policy evaluation and user-based queries

CREATE INDEX IF NOT EXISTS idx_media_projects_user_id 
ON public.media_projects (user_id);
