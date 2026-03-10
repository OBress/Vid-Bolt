# VidBolt Analytics System Design

> A comprehensive analytics system for VidBolt covering YouTube channel analytics, internal platform metrics, admin dashboards, and interactive data visualization.

---

## Table of Contents

1. [Overview & Goals](#overview--goals)
2. [Data Sources](#data-sources)
3. [OAuth Scope Changes](#oauth-scope-changes)
4. [Database Schema](#database-schema)
5. [Data Sync Strategy](#data-sync-strategy)
6. [API Layer](#api-layer)
7. [User-Facing Analytics](#user-facing-analytics)
8. [Admin-Facing Analytics](#admin-facing-analytics)
9. [Multi-Channel Aggregation](#multi-channel-aggregation)
10. [Interactive Visualization](#interactive-visualization)
11. [Cost Analysis](#cost-analysis)
12. [Implementation Phases](#implementation-phases)
13. [Platform Coverage Gap Analysis](#platform-coverage-gap-analysis)

---

## 1. Overview & Goals

VidBolt needs a thorough analytics system that serves two audiences:

| Audience   | What They See                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Users**  | Their own YouTube channel stats, video performance, subscriber growth, audience demographics, revenue/monetization data, competitor & niche comparison, and VidBolt production metrics                                 |
| **Admins** | **Full visibility** — every individual user's YouTube analytics (drill down by user), combined/aggregated platform-wide stats, user activity metrics, GPU usage, rendering stats, revenue analytics, and system health |

### Design Principles

- **Leverage existing OAuth** — Users already authenticate with GCP OAuth storing refresh tokens in `user_gcp_config`. We extend scopes to include YouTube Analytics.
- **Cache aggressively** — YouTube data is fetched periodically and stored in Supabase, not real-time.
- **Keep costs near zero** — YouTube APIs have generous free quotas (10,000 units/day). No paid third-party services required.
- **Professional visualizations** — Interactive, animated charts using Recharts (composable, React-native, MIT license).
- **Multi-channel support** — Users can link multiple YouTube channels and view aggregated or per-channel analytics.

---

## 2. Data Sources

### 2.1 YouTube Analytics API v2 (Primary — Free)

**Endpoint:** `https://youtubeanalytics.googleapis.com/v2/reports`  
**Auth:** OAuth 2.0 with scope `yt-analytics.readonly`  
**Quota:** 10,000 units/day (shared with YouTube Data API v3), each `reports.query` call costs ~1-5 units

This is the richest data source. Provides historical time-series data for the authenticated user's channels.

#### Available Metrics (what we'll collect)

| Category               | Metrics                                                                                                        | Description                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Views & Watch Time** | `views`, `estimatedMinutesWatched`, `averageViewDuration`                                                      | Core engagement metrics                                                 |
| **Subscribers**        | `subscribersGained`, `subscribersLost`                                                                         | Net subscriber growth tracking                                          |
| **Engagement**         | `likes`, `dislikes`, `comments`, `shares`                                                                      | Social interaction metrics                                              |
| **Revenue**            | `estimatedRevenue`, `estimatedAdRevenue`, `grossRevenue`, `estimatedRedPartnerRevenue`, `adImpressions`, `cpm` | Monetization data — included via `yt-analytics-monetary.readonly` scope |
| **Traffic Sources**    | `views` by `insightTrafficSourceType`                                                                          | Where viewers come from                                                 |
| **Playback**           | `views` by `deviceType`, `operatingSystem`                                                                     | Device/platform breakdown                                               |
| **Demographics**       | `viewerPercentage` by `ageGroup`, `gender`                                                                     | Audience composition                                                    |
| **Geography**          | `views` by `country`                                                                                           | Geographic reach                                                        |
| **Content**            | `views`, `estimatedMinutesWatched` by `video`                                                                  | Per-video performance                                                   |
| **Playlists**          | `playlistStarts`, `playlistViews`, `averageTimeInPlaylist`                                                     | Playlist engagement                                                     |
| **Live**               | `concurrentViewers`                                                                                            | Live-stream metrics                                                     |

#### Available Dimensions (how we'll slice data)

- **Time:** `day`, `month`
- **Geography:** `country`, `province` (US states)
- **Demographics:** `ageGroup`, `gender`
- **Traffic:** `insightTrafficSourceType`, `insightTrafficSourceDetail`
- **Device:** `deviceType`, `operatingSystem`
- **Content:** `video`, `playlist`, `group`

### 2.2 YouTube Data API v3 (Channel & Video Metadata — Free)

**Already integrated** in `lib/youtube/api.ts`. We extend it for channel management:

| Endpoint                                                         | Data                                                                           | Quota Cost         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------ |
| `channels.list?part=snippet,statistics,contentDetails&mine=true` | Channel name, profile pic, total subscribers/views/videos, uploads playlist ID | 1 unit             |
| `channels.list?part=statistics&id={channelId}`                   | Live subscriber/view counts for any channel ID                                 | 1 unit             |
| `videos.list?part=statistics,snippet&id={ids}`                   | Per-video stats (views, likes, comments)                                       | 1 unit per request |
| `search?part=snippet&channelId={id}&type=video&order=date`       | Recent uploads list                                                            | 100 units          |

### 2.3 Internal Platform Analytics (Free — Supabase Queries)

Data already in the database that we can query directly:

| Source Table             | Metrics                                                                         |
| ------------------------ | ------------------------------------------------------------------------------- |
| `video_projects`         | Videos created, completion rate, average production time, stage distribution    |
| `tasks`                  | Script generations, success/failure rates, average duration per task type       |
| `render_jobs`            | Renders completed, average render time, cost per render, failure rate           |
| `gpu_hours_transactions` | GPU hours purchased, consumed, refunded; spending patterns                      |
| `monthly_statements`     | Revenue tracked, commission paid, payment status distribution                   |
| `users`                  | User growth, activation rate, retention (active vs. pending), tier distribution |
| `stock_media`            | Media sourced per provider (Pexels, Pixabay, YouTube, etc.), total assets       |

### 2.4 Computed / Derived Metrics (Free — Server-Side)

Metrics we calculate from the data above:

| Metric                         | Formula                                 | Used By     |
| ------------------------------ | --------------------------------------- | ----------- |
| **Content Velocity**           | Videos published / time period          | User, Admin |
| **Production Efficiency**      | Time from idea → completed video        | User, Admin |
| **Subscriber-to-View Ratio**   | Views / Subscribers (engagement health) | User        |
| **Revenue per Video**          | Total revenue / video count             | User        |
| **Revenue per 1K Views (RPM)** | (Revenue / Views) × 1000                | User        |
| **Audience Retention Score**   | Avg view duration / Avg video duration  | User        |
| **Platform Utilization**       | Active users / Total users              | Admin       |
| **GPU Cost Efficiency**        | GPU hours used / Videos completed       | Admin       |
| **Render Success Rate**        | Completed renders / Total renders       | Admin       |
| **User LTV Estimate**          | Avg revenue per user over lifetime      | Admin       |

### 2.5 Competitor & Niche Benchmarking (Free via YouTube Data API)

A dedicated competitor analytics system allowing users to compare their channel against related creators in their niche:

#### What We Can Track (Public Data)

| Data Point                                            | API Endpoint                                  | Quota Cost           |
| ----------------------------------------------------- | --------------------------------------------- | -------------------- |
| Channel stats (subscribers, total views, video count) | `channels.list?part=statistics`               | 1 unit               |
| Channel branding (name, avatar, banner, handle)       | `channels.list?part=snippet,brandingSettings` | 1 unit               |
| Recent uploads (last 50 videos)                       | `playlistItems.list` on uploads playlist      | 1 unit               |
| Per-video performance (views, likes, comments)        | `videos.list?part=statistics`                 | 1 unit per 50 videos |
| Upload frequency & schedule patterns                  | Computed from `publishedAt` timestamps        | 0 (computed)         |

#### Niche Discovery

Users can discover related channels in their niche through:

1. **Manual add** — Search by channel name, URL, @handle, or channel ID
2. **Niche suggestions** — When a user adds a competitor, we can use YouTube search to suggest similar channels based on shared keywords/topics from the competitor's video titles
3. **"Channels like this"** — YouTube Data API's `channelSections` and related channels data

#### Historical Trend Tracking

Competitor stats are snapshotted daily into `competitor_channel_snapshots` (new table, see §4) to enable trend graphs showing growth over time. This allows users to see:

- Subscriber growth curves for their channel vs. competitors (overlaid line charts)
- View velocity trends (views/day) compared side-by-side
- Upload frequency comparison (videos/week bar chart)
- Engagement rate trends (likes + comments / views)

> [!NOTE]
> This uses only **public data** from the YouTube Data API. No additional API keys or paid services needed. We already have the `youtube.readonly` scope. Cost: ~2-5 quota units per competitor channel per sync cycle.

### 2.6 Niche Network / Channel Explorer (Free — YouTube Data API + Gemini)

A **force-directed network graph** that shows the user's channel at the center, surrounded by related channels in their niche. This is a discovery/exploration tool — think of it as a "map of your niche" showing who's around you, who's emerging, and how everyone relates.

#### How It Works (Discovery Algorithm)

The niche network is built through a multi-step discovery pipeline:

```
1. EXTRACT TOPICS from user's channel
   → Fetch last 50 video titles + tags via playlistItems.list + videos.list
   → Use Gemini Flash (already available via user's API keys) to extract
     5-10 niche keywords/topics (e.g. "AI tutorials", "machine learning", "Python coding")

2. DISCOVER CHANNELS via YouTube Search
   → search.list?type=channel&q={keyword} for each extracted topic
   → Deduplicate results, exclude user's own channel
   → Fetch channel details via channels.list?part=snippet,statistics,topicDetails

3. EXPAND via "channels like this"
   → For top discovered channels, extract THEIR top video keywords
   → Run secondary search to find channels 2 hops away
   → This creates a natural cluster/community structure

4. COMPUTE SIMILARITY SCORES
   → Use Gemini embeddings or keyword overlap to score how related
     each discovered channel is to the user's channel
   → Score factors: shared keywords (40%), subscriber size proximity (20%),
     upload frequency similarity (20%), topic overlap via topicDetails (20%)

5. BUILD GRAPH
   → User's channel = center node
   → Discovered channels = surrounding nodes
   → Edge weight = similarity score (stronger = closer in graph)
   → Node size = subscriber count (log scale)
   → Color = growth rate (green = fast growing, blue = stable, gray = slow)
```

#### Quota Cost

| Step                                      | API Calls | Quota Cost       |
| ----------------------------------------- | --------- | ---------------- |
| Extract topics (50 videos)                | 2 calls   | ~2 units         |
| Channel search (10 keywords × 10 results) | 10 calls  | ~1,000 units     |
| Channel details (100 channels)            | 2 calls   | ~2 units         |
| Secondary expansion (top 10 × 5 keywords) | 50 calls  | ~5,000 units     |
| **Total per full discovery**              |           | **~6,004 units** |

> [!IMPORTANT]
> A full niche discovery scan is expensive (~6K quota units). It should be run **at most once per week** and cached. The graph is stored in the database and updated incrementally. Users can trigger a manual refresh but are rate-limited to once per 7 days.

#### What Users See

- **Interactive force-directed graph** — Drag, zoom, hover for details
- **Node hover** — Shows channel name, subscribers, recent views, growth rate
- **Node click** — Opens a side panel with channel details, recent videos, option to add as tracked competitor
- **Cluster highlighting** — Related channels cluster together by sub-niche
- **"Emerging" badge** — Channels with high growth rate relative to their size get a special indicator
- **Size filter** — Slider to filter by subscriber count range (e.g. only show channels 10K-100K)
- **Time filter** — Only show channels created in the last 1/2/5 years

#### Key Difference from Competitor Tracking

|                      | Tracked Competitors (§2.5)        | Niche Network (§2.6)                                 |
| -------------------- | --------------------------------- | ---------------------------------------------------- |
| **Purpose**          | Deep analytics on specific rivals | Broad discovery & landscape mapping                  |
| **Channel count**    | Max 10, manually selected         | 50-200, auto-discovered                              |
| **Data depth**       | Daily snapshots, trend history    | Point-in-time stats, similarity scores               |
| **Update frequency** | Daily                             | Weekly                                               |
| **Visualization**    | Tables + comparison charts        | Force-directed network graph                         |
| **Action**           | Compare metrics head-to-head      | Discover new channels → optionally add as competitor |

---

### 2.7 API & Cost Usage Analytics (Free — Already Tracked)

VidBolt already has a comprehensive `CostTracker` in `lib/queues/cost-tracker.ts` that logs per-step costs into `video_projects.metadata.costData`. This data is **already being collected** but has **no analytics UI**.

#### Data Already Being Tracked

| Service                      | What's Tracked                                        | Where Stored                                          |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| **OpenRouter (LLM)**         | Model name, prompt tokens, completion tokens per call | `costData.stepN.llmCalls[]`                           |
| **Valyu**                    | Search count, deep research count                     | `costData.stepN.valyuSearches`, `valyuDeepResearches` |
| **Serper**                   | Image search count                                    | `costData.stepN.serperSearches`                       |
| **GPU Compute**              | Total seconds used                                    | `costData.stepN.totalGpuTimeSeconds`                  |
| **TTS (ElevenLabs/Inworld)** | Character count, model used                           | `costData.stepN.ttsCharacters`, `ttsModel`            |
| **Remotion Render**          | Duration in minutes                                   | `costData.stepN.renderDurationMinutes`                |

#### Additional API Keys Users Can Configure

From `user_api_keys` table — 8 services:

- OpenRouter, ElevenLabs, GenAI (Google), Inworld TTS, Replicate, Google Cloud, Groq, Valyu

#### What We Can Build (No New Data Collection Needed)

| Metric                                            | Source                                | Used By     |
| ------------------------------------------------- | ------------------------------------- | ----------- |
| Total LLM tokens consumed (per user, per project) | `costData`                            | User, Admin |
| LLM cost estimate (tokens × model pricing)        | `costData` + OpenRouter pricing       | User, Admin |
| API calls by service (Valyu, Serper, TTS)         | `costData` aggregated                 | User, Admin |
| GPU hours consumed per project                    | `costData` + `gpu_hours_transactions` | User, Admin |
| Cost per video (total API + GPU + render costs)   | `costData` summed across steps        | User, Admin |
| Cost trend over time                              | `costData` + project timestamps       | User, Admin |
| Which LLM models are most used                    | `costData.llmCalls[].model`           | Admin       |
| Platform-wide API spend                           | All users' `costData` aggregated      | Admin       |

> [!TIP]
> This is a **zero-effort data source** — the collection infrastructure already exists. We just need the aggregation queries and UI components.

---

## 3. OAuth Scope Changes

### Current Scopes (in `app/api/gcp/oauth/authorize/route.ts`)

```typescript
const GCP_SCOPES = [
  "https://www.googleapis.com/auth/compute",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/cloud-platform.read-only",
].join(" ");
```

### Required Updates

```diff
 const GCP_SCOPES = [
   'https://www.googleapis.com/auth/compute',
   'https://www.googleapis.com/auth/youtube.readonly',
   'https://www.googleapis.com/auth/cloud-platform.read-only',
+  'https://www.googleapis.com/auth/yt-analytics.readonly',
+  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',  // Revenue & monetization data
 ].join(' ')
```

> [!IMPORTANT]
> Adding scopes requires users to re-authorize. Existing refresh tokens will not have the new scopes. The app should detect `403 insufficientPermissions` errors and prompt re-authorization.

---

## 4. Database Schema

### 4.1 New Tables

#### `youtube_channels` — Linked YouTube Channels

```sql
CREATE TABLE public.youtube_channels (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id      TEXT NOT NULL,             -- YouTube channel ID (e.g. UC...)
    channel_title   TEXT NOT NULL,
    channel_handle  TEXT,                      -- @handle
    thumbnail_url   TEXT,
    subscriber_count BIGINT DEFAULT 0,
    view_count      BIGINT DEFAULT 0,
    video_count     INTEGER DEFAULT 0,
    custom_url      TEXT,
    is_primary      BOOLEAN DEFAULT false,     -- User's main channel
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
```

#### `youtube_channel_snapshots` — Daily Channel Stats (Time-Series)

```sql
CREATE TABLE public.youtube_channel_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id      UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    subscriber_count BIGINT,
    view_count      BIGINT,
    video_count     INTEGER,
    estimated_revenue NUMERIC(12,2),           -- Daily revenue (if monetary scope)
    views_day       BIGINT,                    -- Views gained that day
    subscribers_gained INTEGER,
    subscribers_lost   INTEGER,
    estimated_minutes_watched BIGINT,
    average_view_duration NUMERIC(10,2),       -- In seconds
    likes           INTEGER,
    dislikes        INTEGER,
    comments        INTEGER,
    shares          INTEGER,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_id, snapshot_date)
);

-- Partitioned index for fast date-range queries
CREATE INDEX idx_channel_snapshots_date ON public.youtube_channel_snapshots(channel_id, snapshot_date DESC);
```

#### `youtube_video_analytics` — Per-Video Performance

```sql
CREATE TABLE public.youtube_video_analytics (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id          UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
    video_id            TEXT NOT NULL,          -- YouTube video ID
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
    subscriber_impact   INTEGER DEFAULT 0,     -- subscribersGained from this video
    -- Traffic source breakdown (JSONB for flexibility)
    traffic_sources     JSONB DEFAULT '{}',    -- {"search": 45, "browse": 30, "external": 15, ...}
    -- Audience demographics (JSONB)
    demographics        JSONB DEFAULT '{}',    -- {"18-24": {"male": 15, "female": 12}, ...}
    -- Geography (JSONB)
    geography           JSONB DEFAULT '{}',    -- {"US": 5000, "GB": 3000, ...}
    -- Device breakdown (JSONB)
    devices             JSONB DEFAULT '{}',    -- {"MOBILE": 60, "DESKTOP": 30, "TV": 10}
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_id, video_id)
);

CREATE INDEX idx_video_analytics_channel ON public.youtube_video_analytics(channel_id);
CREATE INDEX idx_video_analytics_published ON public.youtube_video_analytics(published_at DESC);
CREATE INDEX idx_video_analytics_views ON public.youtube_video_analytics(views DESC);
```

#### `youtube_audience_demographics` — Audience Breakdowns (Periodic Snapshot)

```sql
CREATE TABLE public.youtube_audience_demographics (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    channel_id      UUID NOT NULL REFERENCES public.youtube_channels(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    -- Age + Gender breakdown
    age_gender_data JSONB NOT NULL DEFAULT '{}',
    -- Geographic breakdown
    country_data    JSONB NOT NULL DEFAULT '{}',
    -- Device type breakdown
    device_data     JSONB NOT NULL DEFAULT '{}',
    -- Traffic source breakdown
    traffic_data    JSONB NOT NULL DEFAULT '{}',
    -- Operating system breakdown
    os_data         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(channel_id, snapshot_date)
);

CREATE INDEX idx_audience_demo_channel_date ON public.youtube_audience_demographics(channel_id, snapshot_date DESC);
```

#### `analytics_sync_log` — Sync Job Tracking

```sql
CREATE TABLE public.analytics_sync_log (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id      UUID REFERENCES public.youtube_channels(id) ON DELETE SET NULL,
    sync_type       TEXT NOT NULL CHECK (sync_type IN ('channel_stats', 'daily_snapshot', 'video_analytics', 'demographics', 'full_sync')),
    status          TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    records_synced  INTEGER DEFAULT 0,
    quota_used      INTEGER DEFAULT 0,        -- YouTube API quota units consumed
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER
);

CREATE INDEX idx_sync_log_user ON public.analytics_sync_log(user_id, started_at DESC);
```

#### `competitor_channels` — Competitor Tracking

```sql
CREATE TABLE public.competitor_channels (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id      TEXT NOT NULL,              -- YouTube channel ID
    channel_title   TEXT,
    channel_handle  TEXT,                       -- @handle
    thumbnail_url   TEXT,
    banner_url      TEXT,
    subscriber_count BIGINT DEFAULT 0,
    view_count      BIGINT DEFAULT 0,
    video_count     INTEGER DEFAULT 0,
    avg_views_per_video BIGINT DEFAULT 0,       -- Computed: recent video avg views
    upload_frequency NUMERIC(5,2),              -- Computed: avg videos per week
    niche_tags      TEXT[] DEFAULT '{}',        -- Auto-detected or user-defined niche tags
    label           TEXT,                       -- User-defined label (e.g. "Main Competitor")
    last_synced_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, channel_id)
);
```

#### `competitor_channel_snapshots` — Daily Competitor Stats (Historical Trends)

```sql
CREATE TABLE public.competitor_channel_snapshots (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competitor_id   UUID NOT NULL REFERENCES public.competitor_channels(id) ON DELETE CASCADE,
    snapshot_date   DATE NOT NULL,
    subscriber_count BIGINT,
    view_count      BIGINT,
    video_count     INTEGER,
    -- Recent video performance (computed from latest uploads)
    recent_avg_views BIGINT,                   -- Avg views on last 10 videos
    recent_avg_likes INTEGER,                  -- Avg likes on last 10 videos
    recent_avg_comments INTEGER,               -- Avg comments on last 10 videos
    engagement_rate NUMERIC(8,4),              -- (likes + comments) / views
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(competitor_id, snapshot_date)
);

CREATE INDEX idx_competitor_snapshots_date ON public.competitor_channel_snapshots(competitor_id, snapshot_date DESC);
```

#### `niche_network_channels` — Discovered Niche Channels (Network Graph)

```sql
CREATE TABLE public.niche_network_channels (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    channel_id          TEXT NOT NULL,              -- YouTube channel ID
    channel_title       TEXT,
    channel_handle      TEXT,
    thumbnail_url       TEXT,
    subscriber_count    BIGINT DEFAULT 0,
    view_count          BIGINT DEFAULT 0,
    video_count         INTEGER DEFAULT 0,
    -- Discovery metadata
    discovery_method    TEXT NOT NULL CHECK (discovery_method IN ('keyword_search', 'expansion', 'topic_match', 'manual')),
    discovery_keywords  TEXT[] DEFAULT '{}',        -- Keywords that led to discovery
    -- Similarity & positioning
    similarity_score    NUMERIC(5,4) DEFAULT 0,     -- 0.0-1.0, how related to user's channel
    shared_topics       TEXT[] DEFAULT '{}',         -- Topics in common with user
    topic_categories    TEXT[] DEFAULT '{}',         -- YouTube topicDetails categories
    -- Growth indicators
    growth_rate_30d     NUMERIC(8,4),               -- % subscriber growth in last 30d
    avg_views_recent    BIGINT,                     -- Avg views on last 10 videos
    upload_frequency    NUMERIC(5,2),               -- Videos per week
    channel_created_at  TIMESTAMPTZ,                -- When the channel was created
    is_emerging         BOOLEAN DEFAULT false,      -- High growth relative to size
    -- Graph positioning (cached from layout algorithm)
    graph_x             NUMERIC(10,4),
    graph_y             NUMERIC(10,4),
    graph_cluster       INTEGER,                    -- Cluster/community ID
    -- Management
    last_discovered_at  TIMESTAMPTZ DEFAULT now(),
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, channel_id)
);

CREATE INDEX idx_niche_network_user ON public.niche_network_channels(user_id);
CREATE INDEX idx_niche_network_similarity ON public.niche_network_channels(user_id, similarity_score DESC);
CREATE INDEX idx_niche_network_emerging ON public.niche_network_channels(user_id, is_emerging) WHERE is_emerging = true;
```

#### `niche_network_edges` — Relationships Between Niche Channels

```sql
CREATE TABLE public.niche_network_edges (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    source_channel  TEXT NOT NULL,              -- YouTube channel ID
    target_channel  TEXT NOT NULL,              -- YouTube channel ID
    weight          NUMERIC(5,4) DEFAULT 0,    -- Edge weight (topic similarity)
    shared_keywords TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, source_channel, target_channel)
);

CREATE INDEX idx_niche_edges_user ON public.niche_network_edges(user_id);
```

#### `platform_analytics_daily` — Admin Daily Aggregates

```sql
CREATE TABLE public.platform_analytics_daily (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    snapshot_date       DATE NOT NULL UNIQUE,
    -- User metrics
    total_users         INTEGER,
    active_users        INTEGER,
    pending_users       INTEGER,
    new_users_today     INTEGER,
    -- Production metrics
    videos_created      INTEGER DEFAULT 0,
    videos_completed    INTEGER DEFAULT 0,
    scripts_generated   INTEGER DEFAULT 0,
    renders_completed   INTEGER DEFAULT 0,
    renders_failed      INTEGER DEFAULT 0,
    -- GPU metrics
    gpu_hours_purchased INTEGER DEFAULT 0,
    gpu_hours_consumed  INTEGER DEFAULT 0,
    gpu_revenue_usd     NUMERIC(10,2) DEFAULT 0,
    -- Aggregate YouTube metrics (across all users)
    total_yt_views      BIGINT DEFAULT 0,
    total_yt_subs       BIGINT DEFAULT 0,
    total_yt_videos     INTEGER DEFAULT 0,
    total_yt_revenue    NUMERIC(12,2) DEFAULT 0,
    -- System health
    avg_render_time_ms  INTEGER,
    api_errors_count    INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_platform_daily_date ON public.platform_analytics_daily(snapshot_date DESC);
```

### 4.2 RLS Policies

```sql
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

-- youtube_video_analytics: Through channel ownership, admins see all
ALTER TABLE public.youtube_video_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own video analytics"
    ON public.youtube_video_analytics FOR SELECT
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

-- platform_analytics_daily: Admin only
ALTER TABLE public.platform_analytics_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view platform analytics"
    ON public.platform_analytics_daily FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));

-- analytics_sync_log: Users see their own, admins see all
ALTER TABLE public.analytics_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own sync logs"
    ON public.analytics_sync_log FOR SELECT
    USING (auth.uid() = user_id OR EXISTS (
        SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
    ));
```

---

## 5. Data Sync Strategy

### 5.1 Sync Schedule

| Sync Type              | Frequency                     | Trigger      | Quota Cost          | Description                                                                |
| ---------------------- | ----------------------------- | ------------ | ------------------- | -------------------------------------------------------------------------- |
| **Channel Stats**      | Every 6 hours                 | Cron job     | ~2 units/channel    | Update subscriber/view counts in `youtube_channels`                        |
| **Daily Snapshot**     | Once daily (2 AM UTC)         | Cron job     | ~5 units/channel    | Populate `youtube_channel_snapshots` with day's metrics from Analytics API |
| **Video Analytics**    | Once daily (3 AM UTC)         | Cron job     | ~5-10 units/channel | Update top 50 video stats from Analytics API                               |
| **Demographics**       | Once weekly (Sunday 4 AM UTC) | Cron job     | ~3 units/channel    | Refresh audience demographics in `youtube_audience_demographics`           |
| **Competitor Stats**   | Once daily (5 AM UTC)         | Cron job     | ~2 units/competitor | Update public stats for competitor channels                                |
| **Platform Aggregate** | Once daily (6 AM UTC)         | Cron job     | 0 (local DB)        | Aggregate admin platform metrics from internal tables                      |
| **On-Demand Refresh**  | User-triggered                | Button click | ~10-20 units        | Full refresh for a single channel (rate-limited to 1/hour)                 |

### 5.2 Quota Budget Per Day (Estimated)

Assuming 50 active users with 1 channel each, 5 competitor channels tracked each:

| Operation              | Units/User | Users | Frequency   | Daily Total      |
| ---------------------- | ---------- | ----- | ----------- | ---------------- |
| Channel stats (4x/day) | 2 × 4 = 8  | 50    | 4x          | 400              |
| Daily snapshot         | 5          | 50    | 1x          | 250              |
| Video analytics        | 10         | 50    | 1x          | 500              |
| Demographics           | 3          | 50    | 1/7 = 0.14x | ~21              |
| Competitor stats       | 2 × 5 = 10 | 50    | 1x          | 500              |
| On-demand refreshes    | 15         | ~10   | 1x          | 150              |
| **Total**              |            |       |             | **~1,821 units** |

> [!TIP]
> This is well within the 10,000 units/day free quota. Even at 200 active users, it would only use ~7,300 units/day. Quota is per GCP project (per user in VidBolt since each user provides their own GCP project), so each user gets their own 10,000 units.

### 5.3 Sync Implementation

The sync jobs should be implemented as **BullMQ repeatable workers** using the existing worker infrastructure in `lib/queues/worker-bootstrap.ts`. This keeps all scheduled work in one system with built-in retries, logging, and graceful shutdown — matching the existing patterns for `gpu-shutdown-check` and `data-retention-cleanup`.

**Queue Definitions** (new queues in `lib/queues/`):

```
analytics-channel-stats-queue      -- Every 6h
analytics-daily-snapshot-queue     -- Daily 2 AM UTC (cron: '0 2 * * *')
analytics-video-queue              -- Daily 3 AM UTC (cron: '0 3 * * *')
analytics-demographics-queue       -- Weekly Sunday 4 AM UTC (cron: '0 4 * * 0')
analytics-competitor-queue         -- Daily 5 AM UTC (cron: '0 5 * * *')
analytics-platform-aggregate-queue -- Daily 6 AM UTC (cron: '0 6 * * *')
```

**Worker Processors** (in `lib/queues/workers/analytics-sync.ts`):

Each processor iterates over users with linked channels, calls `getValidGCPToken(userId)` to get that user's OAuth token, then makes YouTube API calls against **the user's own GCP project quota**. One user hitting quota limits doesn't affect others.

**Registration** (in `registerRepeatableJobs()` inside `worker-bootstrap.ts`):

```typescript
// Channel stats sync - every 6 hours
await analyticsChannelStatsQueue.add(
  "sync-channel-stats",
  {},
  {
    repeat: { every: 6 * 60 * 60 * 1000 },
    jobId: "analytics-channel-stats-repeatable",
  },
);

// Daily snapshot - once daily (2 AM UTC)
await analyticsDailySnapshotQueue.add(
  "sync-daily-snapshot",
  {},
  {
    repeat: { pattern: "0 2 * * *" },
    jobId: "analytics-daily-snapshot-repeatable",
  },
);
// ... etc for each sync type
```

Additionally, **on-demand sync API routes** are provided for user-triggered manual refreshes (rate-limited to 1/hour):

```
POST /api/analytics/channels/[channelId]/refresh  -- User-triggered on-demand sync
POST /api/analytics/sync/platform-daily            -- Admin-triggered platform aggregate
```

### 5.4 Error Handling & Resilience

- **Token Expiry:** `getValidGCPToken()` already handles refresh. If refresh fails, mark channel `sync_status = 'error'` and log.
- **Quota Exceeded:** Catch `403 quotaExceeded`, stop syncing for that user, retry next cycle.
- **Partial Failures:** Each user/channel is synced independently. One failure doesn't block others.
- **Rate Limiting:** Add 100ms delay between users to avoid hitting Google rate limits.
- **Stale Data Indicator:** UI shows "Last synced: X minutes ago" based on `last_synced_at`.

---

## 6. API Layer

### 6.1 New API Routes

#### YouTube Analytics Client Extension

Create `lib/youtube/analytics-api.ts`:

```typescript
// YouTube Analytics API v2 Client
// Uses the same getValidGCPToken() flow as the existing YouTube Data API client

export class YouTubeAnalyticsApi {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  // Get channel-level metrics for a date range
  async getChannelMetrics(
    channelId: string,
    startDate: string,
    endDate: string,
    metrics: string[],
  ): Promise<AnalyticsReport>;

  // Get per-video metrics
  async getVideoMetrics(
    channelId: string,
    videoIds: string[],
    startDate: string,
    endDate: string,
  ): Promise<VideoReport>;

  // Get audience demographics
  async getAudienceDemographics(
    channelId: string,
    startDate: string,
    endDate: string,
  ): Promise<DemographicsReport>;

  // Get traffic sources
  async getTrafficSources(
    channelId: string,
    startDate: string,
    endDate: string,
  ): Promise<TrafficReport>;

  // Get geographic data
  async getGeography(
    channelId: string,
    startDate: string,
    endDate: string,
  ): Promise<GeoReport>;
}
```

#### API Route Structure

```
app/api/analytics/
├── channels/
│   ├── route.ts           -- GET: list user's channels, POST: link new channel
│   └── [channelId]/
│       ├── route.ts       -- GET: channel details, DELETE: unlink channel
│       ├── overview/
│       │   └── route.ts   -- GET: channel overview (snapshots, trends)
│       ├── videos/
│       │   └── route.ts   -- GET: video performance table
│       ├── demographics/
│       │   └── route.ts   -- GET: audience breakdown
│       └── refresh/
│           └── route.ts   -- POST: trigger on-demand sync
├── competitors/
│   ├── route.ts           -- GET: list competitors, POST: add competitor
│   └── [competitorId]/
│       └── route.ts       -- DELETE: remove competitor
├── aggregate/
│   └── route.ts           -- GET: multi-channel aggregated view
├── platform/
│   └── route.ts           -- GET: admin platform-wide analytics
├── sync/
│   ├── channel-stats/
│   │   └── route.ts       -- POST: cron endpoint
│   ├── daily-snapshot/
│   │   └── route.ts       -- POST: cron endpoint
│   ├── video-analytics/
│   │   └── route.ts       -- POST: cron endpoint
│   ├── demographics/
│   │   └── route.ts       -- POST: cron endpoint
│   ├── competitors/
│   │   └── route.ts       -- POST: cron endpoint
│   └── platform-daily/
│       └── route.ts       -- POST: cron endpoint
└── internal/
    └── route.ts           -- GET: VidBolt production metrics (tasks, renders, GPU)
```

---

## 7. User-Facing Analytics

### 7.1 Analytics Pages & Navigation

Integrate into the existing command-center navigation structure:

```
command-center/analytics/
├── overview/          -- Dashboard with KPI cards + key charts
├── performance/       -- Video performance deep-dive
├── audience/          -- Demographics, geography, devices
├── revenue/           -- Revenue trends, RPM, per-video revenue
├── competitors/       -- Competitor tracking + comparison charts
├── niche-network/     -- Interactive channel discovery network graph
├── costs/             -- API usage & cost analytics
└── production/        -- VidBolt internal production metrics

(Per-project analytics live in the project detail page's "Analytics" tab)
```

### 7.2 Overview Dashboard

The main analytics landing page features:

**KPI Cards (top row):**
| Card | Data | Trend Indicator |
|------|------|-----------------|
| Total Subscribers | Current count | ↑/↓ vs 30 days ago |
| Total Views (30d) | Sum of last 30 days | ↑/↓ vs previous 30 days |
| Watch Time (30d) | Estimated hours watched | ↑/↓ vs previous 30 days |
| Estimated Revenue (30d) | Revenue if monetized | ↑/↓ vs previous 30 days |
| Videos Published (30d) | Count from VidBolt + YouTube | ↑/↓ vs previous 30 days |
| Avg View Duration | Average in minutes:seconds | ↑/↓ vs previous 30 days |

**Charts (below KPIs):**

1. **Views Over Time** — Area chart (daily views, 7d/30d/90d/1y/all range selector)
2. **Subscriber Growth** — Line chart (net subscribers gained per day)
3. **Watch Time Trend** — Bar chart (estimated minutes watched per day)
4. **Top 10 Videos** — Horizontal bar chart (by views in selected period)
5. **Channel Selector** — Dropdown to switch between linked channels or "All Channels" aggregate

### 7.3 Performance Page

Deep-dive into video-level analytics:

- **Video Performance Table** — Sortable, filterable table with columns: Thumbnail, Title, Published Date, Views, Likes, Comments, Watch Time, Avg View Duration, Revenue, CTR
- **Sorting:** By any column, ascending/descending
- **Filtering:** Date range, minimum views, status (public/unlisted)
- **Video Detail Panel:** Click a video to see time-series performance, traffic sources breakdown, and demographic data for that specific video

### 7.4 Audience Page

- **Demographics Chart** — Stacked bar chart showing age group × gender distribution
- **Geographic Map** — Choropleth/heat map showing views by country (using a simple SVG world map — no paid map service needed)
- **Device Breakdown** — Donut/pie chart (Mobile, Desktop, TV, Tablet, Game Console)
- **Traffic Sources** — Horizontal bar chart (YouTube Search, Browse Features, External, Suggested, Direct, etc.)
- **Operating System** — Donut chart (Android, iOS, Windows, macOS, Linux, etc.)

### 7.5 Revenue Page

Monetization analytics powered by the `yt-analytics-monetary.readonly` scope:

- **Revenue Trend** — Area chart with gradient fill (daily estimated revenue, 7d/30d/90d/1y)
- **RPM Trend** — Line chart (Revenue per 1K views over time)
- **CPM Trend** — Line chart (Cost per 1K ad impressions over time)
- **Revenue by Video** — Table sorted by revenue, with sparklines showing daily revenue trend per video
- **Revenue by Traffic Source** — Horizontal bar chart (which traffic sources generate the most revenue)
- **Revenue by Geography** — Table with country, views, revenue, RPM per country
- **Ad Performance** — Bar chart showing ad impressions and estimated ad revenue over time
- **Revenue per Video Comparison** — Scatter plot (views vs. revenue) to identify which videos monetize best

> [!NOTE]
> Revenue data requires the channel to be monetized via the YouTube Partner Program. If a user's channel isn't monetized, this page shows a friendly explanation and the revenue KPI card on the overview page gracefully hides.

### 7.6 Competitors Page

A dedicated tab under analytics for deep competitor & niche comparison:

#### Competitor Dashboard Header

- **Your Channel Card** — Your channel stats prominently displayed at top left
- **Competitor Cards** — Grid of competitor channel cards showing avatar, name, subscribers, total views
- **Add Competitor** — Search by channel name, @handle, or URL. Auto-suggest related channels based on niche. Max 10 competitors.

#### Comparison Charts

| Chart                              | Type               | Description                                                                                                                              |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Subscriber Growth Overlay**      | Multi-line chart   | Your channel + all competitors on one chart, showing subscriber count over time (daily snapshots). Toggle individual competitors on/off. |
| **View Velocity Comparison**       | Multi-line chart   | Views gained per day/week for each channel, showing growth momentum                                                                      |
| **Upload Frequency**               | Grouped bar chart  | Videos published per week for each channel, side by side                                                                                 |
| **Engagement Rate Comparison**     | Radar/spider chart | Compare (likes + comments) / views ratio across channels                                                                                 |
| **Subscriber Milestones Timeline** | Timeline chart     | When each channel hit key milestones (1K, 10K, 100K, 1M subscribers)                                                                     |
| **Avg Views Per Video**            | Bar chart          | Average views on the last 10 uploads for each channel                                                                                    |

#### Comparison Table

- Sortable table with columns: Channel (avatar + name), Subscribers, Total Views, Video Count, Avg Views/Video, Upload Freq (per week), Engagement Rate, Growth Rate (30d)
- Each row expandable to show recent video titles and their stats
- Color-coded indicators: green if your channel exceeds competitor, red if behind

#### Niche Insights

- **Best Posting Time** — Analyze when top-performing competitors publish (day of week × time of day)
- **Title/Tag Analysis** — Common keywords in competitor video titles (word cloud or frequency table)
- **Content Gap Finder** — Topics competitors cover that you don't (based on video title analysis)

### 7.7 Niche Network Page

An interactive **force-directed network graph** showing the user's channel in context of their entire niche landscape:

#### Network Graph (Main View)

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 Filter: [Subscribers ▼ 1K-1M] [Created ▼ Last 5y] [Refresh]  │
│                                                                     │
│         ○ Channel F                    ○ Channel G                  │
│        (12K subs)                     (8K subs)                     │
│             \                           /                           │
│              \        ○ Channel C      /                            │
│               \      (45K subs)      /                              │
│                \        |           /                                │
│     ○ Ch D ─────●═══YOUR CHANNEL═══──── ○ Channel B                │
│    (30K)       (25K subs)              (90K subs)                   │
│                /        |           \                                │
│               /    ○ Channel E       \                              │
│              /     ⭐ (3K, +40%)      \                              │
│             /       EMERGING           ○ Channel H                  │
│         ○ Channel A                   (200K subs)                   │
│        (55K subs)                                                   │
│                                                                     │
│  Legend: ● You  ○ Discovered  ⭐ Emerging  Line = shared topics     │
│  Node size = subscriber count  |  Color = growth rate               │
└─────────────────────────────────────────────────────────────────────┘
```

**Graph Features:**

- **Force-directed layout** using D3.js force simulation (bundled with Recharts dependency)
- **Drag nodes** to rearrange, pinch/scroll to zoom, pan to navigate
- **Hover tooltip** — Channel name, @handle, subscribers, total views, growth rate, shared topics
- **Click node** — Opens detail side panel (see below)
- **Cluster coloring** — Channels naturally cluster by sub-niche (e.g. "AI tutorials" cluster vs. "ML research" cluster)
- **Edge thickness** — Thicker edges = higher topic similarity between channels
- **Animated entrance** — Nodes spring into position with physics animation

#### Node Detail Side Panel (on click)

```
┌──────────────────────────────────┐
│  [Avatar] @channelhandle         │
│  Channel Name              [✕]  │
│  ─────────────────────────────── │
│  📊 45,200 subscribers           │
│  👁 2.1M total views             │
│  🎬 342 videos                   │
│  📈 +12% growth (30d)            │
│  ⏰ 2.3 videos/week              │
│                                  │
│  Shared Topics:                  │
│  [AI tutorials] [Python] [ML]    │
│                                  │
│  Recent Videos:                  │
│  • "How to Build AI Agents" 45K  │
│  • "Python Tips 2026" 23K        │
│  • "ML for Beginners" 67K        │
│                                  │
│  [➕ Track as Competitor]         │
│  [🔗 Open on YouTube]            │
└──────────────────────────────────┘
```

#### Discovery Controls

- **Refresh Network** — Re-run the discovery algorithm (rate-limited to 1x per 7 days)
- **Subscriber filter slider** — Filter visible nodes by subscriber range
- **Show only emerging** — Toggle to highlight only fast-growing channels
- **Cluster view** — Group nodes by detected sub-niche clusters
- **List view toggle** — Switch from graph to a sortable table of all discovered channels
- **"Add to competitors"** — One-click to move a discovered channel into the tracked competitors list

#### How Discovery Stays Fresh

- The network is built on first use (or when user clicks "Discover My Niche")
- Stats for discovered channels are refreshed weekly during the competitor sync cycle
- Channels that no longer produce content (no uploads in 6+ months) are dimmed/faded
- New channels discovered in subsequent scans get a "NEW" badge

### 7.8 Production Metrics Page

VidBolt-specific (no YouTube API needed):

- **Videos Pipeline** — Funnel chart: Ideas → Outlines → Scripts → Production → Completed
- **Production Time** — Average time from idea to completed video, broken down by stage
- **Task Success Rate** — Pie chart (completed vs. failed tasks)
- **GPU Usage** — Bar chart (hours purchased vs. consumed over time)
- **Render Performance** — Average render time trend, success rate trend

### 7.9 API & Cost Analytics Page

Leverages data already collected by `CostTracker` in `video_projects.metadata.costData`:

#### Cost Overview (KPI Cards)

| Card                  | Data                                       |
| --------------------- | ------------------------------------------ |
| Total API Spend (30d) | Sum of estimated costs across all services |
| LLM Tokens Used (30d) | Total prompt + completion tokens           |
| Videos Produced (30d) | Count of completed projects                |
| Avg Cost per Video    | Total spend / videos completed             |

#### Cost Breakdown Charts

- **Cost by Service** — Donut chart (LLM, TTS, GPU, Valyu Research, Serper, Render)
- **Cost Trend** — Stacked area chart (daily spend broken down by service, 7d/30d/90d)
- **LLM Usage by Model** — Horizontal bar chart showing token consumption by model (Gemini, Claude, GPT, etc.)
- **TTS Characters** — Bar chart (characters synthesized per video/over time)
- **GPU Hours** — Area chart (hours consumed vs. purchased over time)
- **Cost per Video Table** — Sortable table: Video Name, Total Cost, LLM Cost, TTS Cost, GPU Cost, Render Cost, Date

#### How It Works

Aggregation is done by querying `video_projects.metadata->costData` across all projects for the user, summing up per-step costs. No new data collection — just JSONB queries against existing data.

### 7.10 Per-Project Analytics Tab

**Replaces the current placeholder** in `components/features/project/AnalyticsTab.tsx`.

When a user clicks into a specific video project, the Analytics tab shows:

#### If Published to YouTube

- **Video Performance KPIs** — Views, watch time, likes, comments, shares (from `youtube_video_analytics`)
- **View Trend** — Area chart showing daily views since publish
- **Traffic Sources** — Pie chart for this specific video
- **Audience Demographics** — Age/gender breakdown for this video
- **Comparison** — How this video compares to the user's channel average

#### Production Cost Breakdown (Always Available)

- **Cost Waterfall** — Stacked bar chart showing cost at each pipeline step (Research → Outline → Script → Media → Audio → Render)
- **LLM Calls** — Table: Step, Model, Prompt Tokens, Completion Tokens, Est. Cost
- **Processing Timeline** — Gantt-style chart showing time spent in each pipeline stage
- **Resource Usage Summary** — TTS characters, GPU seconds, render duration for this specific project

> [!NOTE]
> The production cost data is available for **every** project (from `metadata.costData`), even if the video was never published to YouTube. YouTube performance data only appears if the video was published and linked.

---

## 8. Admin-Facing Analytics

The admin has **full visibility into everything** — both individual user analytics and combined/aggregated platform-wide stats.

### 8.1 Enhanced Admin Analytics Tab

Replace the current basic `AnalyticsTab` with a rich, multi-view dashboard:

**KPI Cards:**
| Card | Metric |
|------|--------|
| Total Users | Count + growth rate |
| Active Users (30d) | Users who logged in |
| Videos Completed | Platform-wide completed videos |
| Total GPU Revenue | Sum of GPU hour purchases |
| Total YouTube Views (All Users) | Aggregate across all user channels |
| Total YouTube Subscribers (All Users) | Aggregate |
| Total YouTube Revenue (All Users) | Aggregate estimated revenue |
| System Uptime | Render success rate |

**Admin Charts:**

1. **User Growth** — Area chart (new users per day/week/month)
2. **User Activation Funnel** — Funnel: Signed Up → Onboarded → First Video → Active
3. **Platform YouTube Aggregate** — Line chart (total views, subscribers across all users over time)
4. **Revenue Dashboard** — Bar chart (GPU hours revenue, commissions paid, per user breakdown)
5. **GPU Usage Heatmap** — Usage by day-of-week × hour-of-day
6. **Render Jobs** — Stacked bar chart (queued, rendering, completed, failed per day)
7. **Top Users by YouTube Performance** — Leaderboard table (subscribers, views, videos, revenue)
8. **System Health** — Sync success rate, API error rate, average response times

### 8.2 Admin Individual User Drill-Down

Admins can click on any user in the admin panel to see **that user's complete YouTube analytics** as if viewing their own dashboard:

- **User YouTube Overview** — All KPI cards (subscribers, views, watch time, revenue) for the selected user
- **User's Channel List** — See all channels linked by that user
- **User's Video Performance** — Full video analytics table for the user
- **User's Audience Data** — Demographics, geography, devices, traffic sources for the user's channel(s)
- **User's Revenue Data** — Full revenue breakdown per video, per day, RPM/CPM
- **User's Competitor List** — See which competitors the user is tracking
- **User's Production Metrics** — VidBolt pipeline stats for that specific user (videos created, render times, GPU usage)

This is implemented by passing a `userId` query parameter to the analytics API endpoints. RLS policies already grant admins read access to all user data.

### 8.3 Admin Combined View

The default admin analytics page shows **combined/aggregated** data across all users:

- **Combined YouTube Stats** — Total subscribers, views, watch time, revenue across all user channels
- **Per-User Breakdown Table** — Sortable table: User, Channels, Total Subscribers, Total Views (30d), Revenue (30d), Videos Created, Last Active
- **Platform Revenue Trends** — Stacked area chart showing each user's YouTube revenue contribution over time
- **Content Production Leaderboard** — Who's producing the most videos, fastest production times

### 8.4 Admin-Only API

```
GET /api/analytics/platform                    -- Aggregated platform metrics
GET /api/analytics/platform/users              -- All users with YouTube summary stats
GET /api/analytics/platform/users/[userId]     -- Full analytics for a specific user (admin only)
GET /api/analytics/platform/revenue            -- Combined YouTube + GPU revenue breakdown
GET /api/analytics/platform/leaderboard        -- Top users by various metrics
```

All protected by admin check.

---

## 9. Multi-Channel Aggregation

### 9.1 How It Works

Users who manage multiple YouTube channels (e.g., different niches, languages) can:

1. **Link multiple channels** — After GCP OAuth, fetch all channels owned by the user via `channels.list?mine=true`
2. **View per-channel** — Channel selector dropdown in analytics UI
3. **View aggregated** — "All Channels" option sums up metrics across channels

### 9.2 Aggregation Logic

```typescript
// For numeric metrics: sum across channels
aggregatedViews = channel1.views + channel2.views + ...

// For averages: weighted by views
aggregatedAvgDuration =
  (channel1.avgDuration * channel1.views + channel2.avgDuration * channel2.views)
  / (channel1.views + channel2.views)

// For demographics: merge and normalize
// Country data: sum views per country across channels
// Age/Gender: weighted merge
```

### 9.3 UI Pattern

```
┌──────────────────────────────────────────────────┐
│  Channel: [▼ All Channels (3)              ]     │
│           ├── All Channels (3)                   │
│           ├── Tech Reviews (UC...)               │
│           ├── Gaming Daily (UC...)               │
│           └── Cooking with AI (UC...)            │
└──────────────────────────────────────────────────┘
```

---

## 10. Interactive Visualization

### 10.1 Charting Library: Recharts

**Why Recharts:**

- React-native composable components
- MIT license, free
- Built on D3.js for math, React for rendering
- Supports all needed chart types: Line, Area, Bar, Pie, Radar, Scatter, Treemap, Funnel
- Built-in animations, tooltips, responsive containers
- Actively maintained, large ecosystem

**Installation:** `npm install recharts`

### 10.2 Chart Components to Build

| Component               | Type                                | Where Used            |
| ----------------------- | ----------------------------------- | --------------------- |
| `ViewsChart`            | Area chart with gradient fill       | Overview, Performance |
| `SubscriberGrowthChart` | Line chart with markers             | Overview              |
| `WatchTimeChart`        | Bar chart                           | Overview              |
| `TopVideosChart`        | Horizontal bar chart                | Overview, Performance |
| `DemographicsChart`     | Stacked bar chart                   | Audience              |
| `GeoChart`              | Custom SVG map with tooltips        | Audience              |
| `DeviceBreakdown`       | Donut/pie chart                     | Audience              |
| `TrafficSourcesChart`   | Horizontal bar chart                | Audience              |
| `RevenueChart`          | Area chart with currency formatting | Revenue               |
| `RPMChart`              | Line chart                          | Revenue               |
| `CompetitorComparison`  | Multi-line comparison chart         | Competitors           |
| `NicheNetworkGraph`     | Force-directed graph (D3 + React)   | Niche Network         |
| `PipelineFunnel`        | Funnel chart                        | Production            |
| `GPUUsageChart`         | Stacked bar chart                   | Production, Admin     |
| `UserGrowthChart`       | Area chart                          | Admin                 |
| `RenderJobsChart`       | Stacked bar chart                   | Admin                 |
| `HeatmapChart`          | Custom grid with color intensity    | Admin                 |
| `SparklineChart`        | Tiny inline charts for tables       | Tables                |

### 10.3 Standard Chart Features

Every chart should include:

- **Time range selector:** 7d / 30d / 90d / 1y / All / Custom
- **Responsive container:** `<ResponsiveContainer>` wrapping
- **Animated transitions:** `animationDuration={300}` with `animationEasing="ease-in-out"`
- **Custom tooltips:** Dark-mode styled, formatted numbers
- **Loading skeleton:** Shimmer/pulse animation while data fetches
- **Empty state:** Friendly message when no data is available
- **Export:** CSV download button for underlying data

### 10.4 Design Tokens

```css
/* Analytics color palette */
--chart-primary: hsl(220, 90%, 56%); /* Electric blue */
--chart-secondary: hsl(280, 80%, 60%); /* Purple */
--chart-success: hsl(150, 70%, 45%); /* Green */
--chart-warning: hsl(40, 90%, 55%); /* Amber */
--chart-danger: hsl(0, 80%, 55%); /* Red */
--chart-info: hsl(190, 80%, 50%); /* Cyan */
--chart-gradient-start: hsl(220, 90%, 56%);
--chart-gradient-end: hsl(220, 90%, 56%, 0.1);
--chart-grid: hsl(0, 0%, 20%); /* Subtle grid lines */
--chart-text: hsl(0, 0%, 60%); /* Axis labels */
--chart-tooltip-bg: hsl(0, 0%, 12%);
--chart-tooltip-border: hsl(0, 0%, 25%);
```

---

## 11. Cost Analysis

### 11.1 Total Additional Cost

| Item                  | Cost         | Notes                                                          |
| --------------------- | ------------ | -------------------------------------------------------------- |
| YouTube Analytics API | **$0**       | Free, 10,000 units/day quota per user's GCP project            |
| YouTube Data API v3   | **$0**       | Already enabled, same quota pool                               |
| Recharts library      | **$0**       | MIT license                                                    |
| Supabase storage      | **~$0**      | New tables are small; daily snapshots = ~365 rows/year/channel |
| Cron jobs             | **$0**       | Railway cron or Upstash QStash free tier                       |
| **Total**             | **$0/month** | All free tier                                                  |

### 11.2 Database Storage Estimate

| Table                           | Rows/Year (per channel) | Avg Row Size | Storage/Year |
| ------------------------------- | ----------------------- | ------------ | ------------ |
| `youtube_channel_snapshots`     | 365                     | ~200 bytes   | ~73 KB       |
| `youtube_video_analytics`       | ~200 videos             | ~1 KB        | ~200 KB      |
| `youtube_audience_demographics` | 52                      | ~2 KB        | ~104 KB      |
| `competitor_channels`           | ~10                     | ~200 bytes   | ~2 KB        |
| `competitor_channel_snapshots`  | 365 × 10 competitors    | ~150 bytes   | ~548 KB      |
| `platform_analytics_daily`      | 365                     | ~300 bytes   | ~110 KB      |
| **Total per channel/year**      |                         |              | **~1.04 MB** |

For 100 users × 1.5 channels average = **~58 MB/year**. Negligible.

---

## 12. Implementation Phases

### Phase 1: Foundation (Core Infrastructure)

- Add YouTube Analytics API scopes to OAuth
- Create database migration with all new tables + RLS policies
- Build `YouTubeAnalyticsApi` client in `lib/youtube/analytics-api.ts`
- Build channel linking flow (discover user's channels via Data API)
- Implement basic sync: channel stats + daily snapshots
- Install Recharts

### Phase 2: User Dashboard (Overview + Performance + Costs)

- Build analytics overview page with KPI cards
- Implement Views, Subscriber Growth, Watch Time charts
- Build video performance table with sorting/filtering
- Implement channel selector dropdown for multi-channel support
- Wire up on-demand refresh button
- Build API & Cost Analytics page:
  - JSONB aggregation queries for `video_projects.metadata.costData`
  - Cost by service donut chart, cost trend stacked area chart
  - LLM usage by model chart, cost per video table
- Replace per-project `AnalyticsTab` placeholder:
  - Production cost waterfall per project
  - YouTube video performance (if published)
  - Processing timeline

### Phase 3: Deep Analytics (Audience, Revenue, Competitors)

- Build audience demographics page (age/gender, geo, devices, traffic sources)
- Build revenue analytics page with full monetization data (RPM, CPM, ad impressions, per-video revenue)
- Implement competitor tracking system:
  - Add/search/remove competitors (by name, @handle, URL)
  - Competitor snapshots table + daily sync for historical trends
  - Subscriber growth overlay chart (your channel vs. competitors)
  - View velocity, upload frequency, engagement rate comparison charts
  - Niche insights: posting time analysis, title keyword analysis
- Build production metrics page (VidBolt internal: pipeline funnel, GPU, renders)

### Phase 4: Niche Network (Channel Explorer)

- Build niche discovery algorithm:
  - Topic extraction from user's videos via Gemini Flash
  - YouTube Search API channel discovery by extracted keywords
  - Secondary expansion (2-hop discovery via discovered channels' keywords)
  - Similarity scoring (keyword overlap + size proximity + topic match)
- Create `niche_network_channels` and `niche_network_edges` tables
- Build force-directed network graph component (D3.js force simulation + React)
  - Interactive: drag, zoom, hover tooltips, click to open detail panel
  - Cluster coloring, node sizing, edge weighting
  - Subscriber filter slider, emerging channel badges
- Build node detail side panel (channel stats, recent videos, "add to competitors" action)
- Implement weekly refresh with rate limiting
- Add list view toggle as alternative to graph view

### Phase 5: Admin Dashboard (Full Access)

- Enhance admin AnalyticsTab with platform-wide combined metrics
- Build admin individual user drill-down (view any user's full YouTube analytics)
- Build admin-only platform analytics API (aggregated + per-user endpoints)
- Implement user growth, combined revenue, GPU usage, render jobs charts
- Build user leaderboard by YouTube performance (subscribers, views, revenue)
- Add per-user breakdown table with sortable columns
- Add system health monitoring views

### Phase 6: Polish & Optimization

- Add data export (CSV/JSON) for all analytics views
- Implement date range pickers with custom ranges
- Add comparison mode (current period vs. previous period)
- Optimize queries with materialized views if needed
- Add real-time notifications for milestones (e.g., "You hit 10K subscribers!")

---

## Appendix: YouTube Analytics API Query Examples

### Daily Views & Watch Time (Last 30 Days)

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-02-06
  &endDate=2026-03-08
  &metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares
  &dimensions=day
  &sort=day
```

### Top 10 Videos by Views (Last 30 Days)

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-02-06
  &endDate=2026-03-08
  &metrics=views,estimatedMinutesWatched,averageViewDuration,likes,comments
  &dimensions=video
  &sort=-views
  &maxResults=10
```

### Demographics (Gender × Age Group)

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-02-06
  &endDate=2026-03-08
  &metrics=viewerPercentage
  &dimensions=ageGroup,gender
```

### Traffic Sources

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-02-06
  &endDate=2026-03-08
  &metrics=views,estimatedMinutesWatched
  &dimensions=insightTrafficSourceType
  &sort=-views
```

### Geographic Distribution (Top Countries)

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-02-06
  &endDate=2026-03-08
  &metrics=views,estimatedMinutesWatched
  &dimensions=country
  &sort=-views
  &maxResults=25
```

### Revenue Report (Requires Monetary Scope)

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ?ids=channel==MINE
  &startDate=2026-02-06
  &endDate=2026-03-08
  &metrics=estimatedRevenue,estimatedAdRevenue,grossRevenue
  &dimensions=day
  &sort=day
```

---

## 13. Platform Coverage Gap Analysis

This section audits every analytics-related surface in VidBolt and confirms what this design covers.

### Placeholder Pages & Components Filled

| Current State                                | Location                                            | Status After Implementation    |
| -------------------------------------------- | --------------------------------------------------- | ------------------------------ |
| ❌ `PlaceholderPage` "Performance Analytics" | `app/command-center/analytics/performance/page.tsx` | ✅ §7.3 Performance Page       |
| ❌ `PlaceholderPage` "Audience Analytics"    | `app/command-center/analytics/audience/page.tsx`    | ✅ §7.4 Audience Page          |
| ❌ `AnalyticsTab` "Analytics System Pending" | `components/features/project/AnalyticsTab.tsx`      | ✅ §7.10 Per-Project Analytics |
| ⚠️ Basic admin analytics (4 KPIs)            | `components/features/admin/tabs/AnalyticsTab.tsx`   | ✅ §8 Full Admin Dashboard     |

### Feature Areas Covered

| Area                       | User Analytics | Admin Analytics | Data Source                                  |
| -------------------------- | :------------: | :-------------: | -------------------------------------------- |
| YouTube Channel Stats      |       ✅       |       ✅        | YouTube Data API v3, Analytics API v2        |
| Video Performance          |       ✅       |       ✅        | YouTube Analytics API v2                     |
| Subscriber Growth          |       ✅       |       ✅        | YouTube Analytics API v2                     |
| Audience Demographics      |       ✅       |       ✅        | YouTube Analytics API v2                     |
| Traffic Sources            |       ✅       |       ✅        | YouTube Analytics API v2                     |
| Geographic Data            |       ✅       |       ✅        | YouTube Analytics API v2                     |
| Device/OS Breakdown        |       ✅       |       ✅        | YouTube Analytics API v2                     |
| Revenue/Monetization       |       ✅       |       ✅        | YouTube Analytics API v2 (monetary scope)    |
| Competitor Tracking        |       ✅       |       ✅        | YouTube Data API v3 (public data)            |
| Niche Network/Discovery    |       ✅       |       ✅        | YouTube Data API v3 + Gemini                 |
| API/Cost Usage             |       ✅       |       ✅        | Existing `CostTracker` → `metadata.costData` |
| LLM Token Usage            |       ✅       |       ✅        | Existing `CostTracker`                       |
| TTS Usage                  |       ✅       |       ✅        | Existing `CostTracker`                       |
| GPU Hour Tracking          |       ✅       |       ✅        | `gpu_hours_transactions` table               |
| Render Performance         |       ✅       |       ✅        | `render_jobs` table                          |
| Video Production Pipeline  |       ✅       |       ✅        | `video_projects`, `tasks` tables             |
| Multi-Channel Aggregation  |       ✅       |       ✅        | Aggregation across `youtube_channels`        |
| Per-Project Cost Breakdown |       ✅       |       ✅        | `video_projects.metadata.costData`           |
| User Growth & Activation   |       —        |       ✅        | `users` table                                |
| Platform Revenue (GPU)     |       —        |       ✅        | `gpu_hours_transactions` table               |
| Per-User Drill-Down        |       —        |       ✅        | All tables via admin RLS bypass              |
| System Health              |       —        |       ✅        | `analytics_sync_log`, `render_jobs`          |

### What This Doesn't Cover (Out of Scope / Future Considerations)

| Area                                                   | Why Not Included                                                                    | When to Add                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Real-time live analytics**                           | YouTube API doesn't support real-time; cron-based updates are the standard approach | Not recommended — adds complexity without YouTube support                 |
| **Cross-platform analytics** (TikTok, Instagram, etc.) | VidBolt is YouTube-focused; each platform has its own API and OAuth                 | Phase 7+ if VidBolt expands to multi-platform publishing                  |
| **A/B testing analytics**                              | Requires custom thumbnail/title A/B testing infrastructure                          | After title/thumbnail generation feature stabilizes                       |
| **Content recommendation engine**                      | Would suggest what videos to make based on analytics                                | Could leverage niche network data in Phase 7+                             |
| **Predictive analytics**                               | ML-based view/subscriber predictions                                                | After 6+ months of historical data is collected                           |
| **Storage usage analytics**                            | R2/S3 bucket usage per user                                                         | Low priority — add to admin dashboard if storage costs become significant |

> [!NOTE]
> With the 10 defined user pages (overview, performance, audience, revenue, competitors, niche network, costs, production, per-project analytics) and the comprehensive admin dashboard (combined + per-user drill-down), **every analytics placeholder in the current codebase is addressed** and every meaningful data source is utilized.
