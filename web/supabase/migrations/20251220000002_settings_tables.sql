-- Migration: 002_settings_tables.sql
-- Description: Create tables for media projects and settings (project & user)

-- 1. Create media_projects table
CREATE TABLE IF NOT EXISTS public.media_projects (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    picture_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create project_settings table
CREATE TABLE IF NOT EXISTS public.project_settings (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.media_projects(id) ON DELETE CASCADE UNIQUE,
    settings JSONB NOT NULL DEFAULT '{
        "basic_info": {},
        "voice": {},
        "visuals": {},
        "editing": {},
        "export": {}
    }'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.media_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for media_projects
CREATE POLICY "Users can manage their own media projects" 
ON public.media_projects 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 6. RLS Policies for project_settings
CREATE POLICY "Users can manage settings for their owned projects" 
ON public.project_settings 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.media_projects 
        WHERE public.media_projects.id = public.project_settings.project_id 
        AND public.media_projects.user_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.media_projects 
        WHERE public.media_projects.id = public.project_settings.project_id 
        AND public.media_projects.user_id = auth.uid()
    )
);

-- 7. RLS Policies for user_settings
CREATE POLICY "Users can manage their own general settings" 
ON public.user_settings 
FOR ALL 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 8. Triggers for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_media_projects
BEFORE UPDATE ON public.media_projects
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_project_settings
BEFORE UPDATE ON public.project_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_user_settings
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 9. Secondary LLM credentials note
-- User API keys are already handled by user_api_keys table from previous migrations.
