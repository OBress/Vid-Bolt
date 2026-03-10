-- ============================================================================
-- Analytics System Tables
-- ============================================================================
-- Adds tables for YouTube channel analytics, competitor tracking,
-- niche network discovery, and admin platform metrics.
-- ============================================================================

-- ===========================================
-- youtube_channels — Linked YouTube Channels
-- ===========================================
CREATE TABLE public.youtube_channels (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id      TEXT NOT NULL,
    channel_title   TEXT NOT NULL,
    channel_handle  TEXT,
    thumbnail_url   TEXT,
    subscriber_count BIGINT DEFAULT 0,
    view_count      BIGINT DEFAULT 0,
    video_count     INTEGER DEFAULT 0,
    custom_url      TEXT,
    is_primary      BOOLEAN DEFAULT false,
    linked_at       TIMESTAMPTZ DEFAULT now(),
    last_synced_at  TIMESTAMPTZ,
    sync_status     TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'syncing', 'synced', 'error')),
    sync_error      TEXT,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, channel_id)
);

CREATE INDEX idx_youtube_channels_user_id ON public.youtube_channels(user_id);
CREATE INDEX idx_youtube_channels_channel_id ON public.youtube_channels(channel_id);

-- ===========================================
-- youtube_channel_snapshots — Daily Channel Stats (Time-Series)
-- ===========================================
CREATE TABLE public.youtube_channel_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id      UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    subscriber_count BIGINT,
    view_count      BIGINT,
    video_count     INTEGER,
    estimated_revenue NUMERIC(12,2),
    views_day       BIGINT,
    subscribers_gained INTEGER,
    subscribers_lost   INTEGER,
    estimated_minutes_watched BIGINT,
    average_view_duration NUMERIC(10,2),
    likes           INTEGER,
    dislikes        INTEGER,
    comments        INTEGER,
    shares          INTEGER,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_id, snapshot_date)
);

CREATE INDEX idx_channel_snapshots_date ON public.youtube_channel_snapshots(channel_id, snapshot_date DESC);

-- ===========================================
-- youtube_video_analytics — Per-Video Performance
-- ===========================================
CREATE TABLE public.youtube_video_analytics (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id          UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
    video_id            TEXT NOT NULL,
    title               TEXT,
    published_at        TIMESTAMPTZ,
    thumbnail_url       TEXT,
    duration_seconds    INTEGER,
    views               BIGINT DEFAULT 0,
    likes               INTEGER DEFAULT 0,
    comments            INTEGER DEFAULT 0,
    shares              INTEGER DEFAULT 0,
    estimated_minutes_watched BIGINT DEFAULT 0,
    average_view_duration NUMERIC(10,2),
    estimated_revenue   NUMERIC(10,2),
    subscriber_impact   INTEGER DEFAULT 0,
    traffic_sources     JSONB DEFAULT '{}',
    demographics        JSONB DEFAULT '{}',
    geography           JSONB DEFAULT '{}',
    devices             JSONB DEFAULT '{}',
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_id, video_id)
);

CREATE INDEX idx_video_analytics_channel ON public.youtube_video_analytics(channel_id);
CREATE INDEX idx_video_analytics_published ON public.youtube_video_analytics(published_at DESC);
CREATE INDEX idx_video_analytics_views ON public.youtube_video_analytics(views DESC);

-- ===========================================
-- youtube_audience_demographics — Audience Breakdowns
-- ===========================================
CREATE TABLE public.youtube_audience_demographics (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id      UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    age_gender_data JSONB NOT NULL DEFAULT '{}',
    country_data    JSONB NOT NULL DEFAULT '{}',
    device_data     JSONB NOT NULL DEFAULT '{}',
    traffic_data    JSONB NOT NULL DEFAULT '{}',
    os_data         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_id, snapshot_date)
);

CREATE INDEX idx_audience_demo_channel_date ON public.youtube_audience_demographics(channel_id, snapshot_date DESC);

-- ===========================================
-- analytics_sync_log — Sync Job Tracking
-- ===========================================
CREATE TABLE public.analytics_sync_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id      UUID REFERENCES public.youtube_channels(id) ON DELETE SET NULL,
    sync_type       TEXT NOT NULL CHECK (sync_type IN ('channel_stats', 'daily_snapshot', 'video_analytics', 'demographics', 'full_sync', 'competitor_sync', 'platform_aggregate', 'niche_discovery')),
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    records_synced  INTEGER DEFAULT 0,
    quota_used      INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER
);

CREATE INDEX idx_sync_log_user ON public.analytics_sync_log(user_id, started_at DESC);

-- ===========================================
-- competitor_channels — Competitor Tracking
-- ===========================================
CREATE TABLE public.competitor_channels (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id      TEXT NOT NULL,
    channel_title   TEXT,
    channel_handle  TEXT,
    thumbnail_url   TEXT,
    banner_url      TEXT,
    subscriber_count BIGINT DEFAULT 0,
    view_count      BIGINT DEFAULT 0,
    video_count     INTEGER DEFAULT 0,
    avg_views_per_video BIGINT DEFAULT 0,
    upload_frequency NUMERIC(5,2),
    niche_tags      TEXT[] DEFAULT '{}',
    label           TEXT,
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, channel_id)
);

CREATE INDEX idx_competitor_channels_user ON public.competitor_channels(user_id);

-- ===========================================
-- competitor_channel_snapshots — Daily Competitor Stats
-- ===========================================
CREATE TABLE public.competitor_channel_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competitor_id   UUID NOT NULL REFERENCES public.competitor_channels(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    subscriber_count BIGINT,
    view_count      BIGINT,
    video_count     INTEGER,
    recent_avg_views BIGINT,
    recent_avg_likes INTEGER,
    recent_avg_comments INTEGER,
    engagement_rate NUMERIC(8,4),
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(competitor_id, snapshot_date)
);

CREATE INDEX idx_competitor_snapshots_date ON public.competitor_channel_snapshots(competitor_id, snapshot_date DESC);

-- ===========================================
-- niche_network_channels — Discovered Niche Channels
-- ===========================================
CREATE TABLE public.niche_network_channels (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id          TEXT NOT NULL,
    channel_title       TEXT,
    channel_handle      TEXT,
    thumbnail_url       TEXT,
    subscriber_count    BIGINT DEFAULT 0,
    view_count          BIGINT DEFAULT 0,
    video_count         INTEGER DEFAULT 0,
    discovery_method    TEXT NOT NULL CHECK (discovery_method IN ('keyword_search', 'expansion', 'topic_match', 'manual')),
    discovery_keywords  TEXT[] DEFAULT '{}',
    similarity_score    NUMERIC(5,4) DEFAULT 0,
    shared_topics       TEXT[] DEFAULT '{}',
    topic_categories    TEXT[] DEFAULT '{}',
    growth_rate_30d     NUMERIC(8,4),
    avg_views_recent    BIGINT,
    upload_frequency    NUMERIC(5,2),
    channel_created_at  TIMESTAMPTZ,
    is_emerging         BOOLEAN DEFAULT false,
    graph_x             NUMERIC(10,4),
    graph_y             NUMERIC(10,4),
    graph_cluster       INTEGER,
    last_discovered_at  TIMESTAMPTZ DEFAULT now(),
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, channel_id)
);

CREATE INDEX idx_niche_network_user ON public.niche_network_channels(user_id);
CREATE INDEX idx_niche_network_similarity ON public.niche_network_channels(user_id, similarity_score DESC);
CREATE INDEX idx_niche_network_emerging ON public.niche_network_channels(user_id, is_emerging) WHERE is_emerging = true;

-- ===========================================
-- niche_network_edges — Relationships Between Niche Channels
-- ===========================================
CREATE TABLE public.niche_network_edges (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source_channel  TEXT NOT NULL,
    target_channel  TEXT NOT NULL,
    weight          NUMERIC(5,4) DEFAULT 0,
    shared_keywords TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, source_channel, target_channel)
);

CREATE INDEX idx_niche_edges_user ON public.niche_network_edges(user_id);

-- ===========================================
-- platform_analytics_daily — Admin Daily Aggregates
-- ===========================================
CREATE TABLE public.platform_analytics_daily (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_date       DATE NOT NULL UNIQUE,
    total_users         INTEGER,
    active_users        INTEGER,
    pending_users       INTEGER,
    new_users_today     INTEGER,
    videos_created      INTEGER DEFAULT 0,
    videos_completed    INTEGER DEFAULT 0,
    scripts_generated   INTEGER DEFAULT 0,
    renders_completed   INTEGER DEFAULT 0,
    renders_failed      INTEGER DEFAULT 0,
    gpu_hours_purchased INTEGER DEFAULT 0,
    gpu_hours_consumed  INTEGER DEFAULT 0,
    gpu_revenue_usd     NUMERIC(10,2) DEFAULT 0,
    total_yt_views      BIGINT DEFAULT 0,
    total_yt_subs       BIGINT DEFAULT 0,
    total_yt_videos     INTEGER DEFAULT 0,
    total_yt_revenue    NUMERIC(12,2) DEFAULT 0,
    avg_render_time_ms  INTEGER,
    api_errors_count    INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_platform_daily_date ON public.platform_analytics_daily(snapshot_date DESC);


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- youtube_channels: Users see only their own, admins see all
ALTER TABLE public.youtube_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own channels"
    ON public.youtube_channels FOR ALL
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- youtube_channel_snapshots: Through channel ownership, admins see all
ALTER TABLE public.youtube_channel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own channel snapshots"
    ON public.youtube_channel_snapshots FOR SELECT
    USING (channel_id IN (
        SELECT id FROM public.youtube_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
CREATE POLICY "System insert channel snapshots"
    ON public.youtube_channel_snapshots FOR INSERT
    WITH CHECK (channel_id IN (
        SELECT id FROM public.youtube_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- youtube_video_analytics: Through channel ownership, admins see all
ALTER TABLE public.youtube_video_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own video analytics"
    ON public.youtube_video_analytics FOR SELECT
    USING (channel_id IN (
        SELECT id FROM public.youtube_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
CREATE POLICY "System manage video analytics"
    ON public.youtube_video_analytics FOR ALL
    USING (channel_id IN (
        SELECT id FROM public.youtube_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- youtube_audience_demographics: Through channel ownership, admins see all
ALTER TABLE public.youtube_audience_demographics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own demographics"
    ON public.youtube_audience_demographics FOR SELECT
    USING (channel_id IN (
        SELECT id FROM public.youtube_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
CREATE POLICY "System insert demographics"
    ON public.youtube_audience_demographics FOR INSERT
    WITH CHECK (channel_id IN (
        SELECT id FROM public.youtube_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- competitor_channels: Users see only their own, admins see all
ALTER TABLE public.competitor_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own competitors"
    ON public.competitor_channels FOR ALL
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- competitor_channel_snapshots: Through competitor ownership, admins see all
ALTER TABLE public.competitor_channel_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own competitor snapshots"
    ON public.competitor_channel_snapshots FOR SELECT
    USING (competitor_id IN (
        SELECT id FROM public.competitor_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
CREATE POLICY "System insert competitor snapshots"
    ON public.competitor_channel_snapshots FOR INSERT
    WITH CHECK (competitor_id IN (
        SELECT id FROM public.competitor_channels WHERE user_id = auth.uid()
    ) OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- niche_network_channels: Users see only their own, admins see all
ALTER TABLE public.niche_network_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own niche network"
    ON public.niche_network_channels FOR ALL
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- niche_network_edges: Users see only their own, admins see all
ALTER TABLE public.niche_network_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own niche edges"
    ON public.niche_network_edges FOR ALL
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- platform_analytics_daily: Admin only
ALTER TABLE public.platform_analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view platform analytics"
    ON public.platform_analytics_daily FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
CREATE POLICY "System insert platform analytics"
    ON public.platform_analytics_daily FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- analytics_sync_log: Users see their own, admins see all
ALTER TABLE public.analytics_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sync logs"
    ON public.analytics_sync_log FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
CREATE POLICY "System insert sync logs"
    ON public.analytics_sync_log FOR INSERT
    WITH CHECK (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
