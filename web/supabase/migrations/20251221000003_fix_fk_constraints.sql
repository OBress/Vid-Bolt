-- Migration: Fix foreign key constraint on media_projects to reference auth.users
-- This fixes the 400 error when creating projects for users not in public.users

-- Drop the existing foreign key constraint
ALTER TABLE public.media_projects DROP CONSTRAINT IF EXISTS media_projects_user_id_fkey;

-- Add new foreign key constraint referencing auth.users instead
ALTER TABLE public.media_projects 
ADD CONSTRAINT media_projects_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Also fix project_settings and user_settings if needed
-- (they should cascade through media_projects, but let's ensure user_settings is correct too)
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_user_id_fkey;
ALTER TABLE public.user_settings 
ADD CONSTRAINT user_settings_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
