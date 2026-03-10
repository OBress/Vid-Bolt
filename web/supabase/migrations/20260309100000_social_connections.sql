-- ============================================================================
-- Social Connections System
-- ============================================================================
-- Multi-provider OAuth connections + per-project channel assignment
-- ============================================================================

-- social_connections — Multi-provider OAuth connections
CREATE TABLE public.social_connections (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL CHECK (provider IN ('google', 'tiktok', 'instagram', 'x', 'facebook', 'snapchat', 'spotify')),
    provider_email  TEXT,
    provider_name   TEXT,
    provider_avatar TEXT,
    refresh_token   TEXT,
    access_token    TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes          TEXT[],
    is_primary      BOOLEAN DEFAULT false,
    connected_at    TIMESTAMPTZ DEFAULT now(),
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_connections_user ON public.social_connections(user_id);
CREATE INDEX idx_social_connections_provider ON public.social_connections(user_id, provider);

-- RLS
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connections"
    ON public.social_connections FOR ALL
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- Add youtube_channel_id to video_projects for per-project channel assignment
ALTER TABLE public.video_projects
    ADD COLUMN IF NOT EXISTS youtube_channel_id UUID REFERENCES public.youtube_channels(id) ON DELETE SET NULL;

-- Add connection_id to youtube_channels to track which OAuth connection owns them
ALTER TABLE public.youtube_channels
    ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.social_connections(id) ON DELETE SET NULL;

-- Migrate existing GCP tokens → social_connections for backward compatibility
INSERT INTO public.social_connections (user_id, provider, refresh_token, access_token, token_expires_at, is_primary)
SELECT user_id, 'google', gcp_refresh_token, gcp_access_token, gcp_token_expires_at, true
FROM public.user_gcp_config
WHERE gcp_refresh_token IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.users WHERE id = user_gcp_config.user_id)
ON CONFLICT DO NOTHING;
