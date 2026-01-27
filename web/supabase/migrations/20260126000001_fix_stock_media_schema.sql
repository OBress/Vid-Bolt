-- Migration: Fix stock_media schema for proper per-user/video storage
-- Issues fixed:
-- 1. Add 'serper' to allowed sources (was causing insert failures)
-- 2. Add user_id column for per-user filtering
-- 3. Add video_id column for per-video duplicate detection
-- 4. Update match_stock_media to filter by user_id and video_id

-- =============================================================================
-- 1. Drop and recreate source constraint to include 'serper'
-- =============================================================================
ALTER TABLE public.stock_media 
  DROP CONSTRAINT IF EXISTS stock_media_source_check;

ALTER TABLE public.stock_media 
  ADD CONSTRAINT stock_media_source_check 
  CHECK (source = ANY (ARRAY['wikimedia', 'youtube', 'pixabay', 'pexels', 'google', 'serper', 'other']::text[]));

COMMENT ON CONSTRAINT stock_media_source_check ON public.stock_media IS 
  'Allowed sources: wikimedia, youtube, pixabay, pexels, google, serper (Google Images via Serper API), other';

-- =============================================================================
-- 2. Add user_id column (nullable for existing data, will be populated going forward)
-- =============================================================================
ALTER TABLE public.stock_media
  ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add index for efficient per-user queries
CREATE INDEX IF NOT EXISTS idx_stock_media_user_id 
  ON public.stock_media(user_id);

-- =============================================================================
-- 3. Add video_id column for per-video duplicate detection
-- =============================================================================
ALTER TABLE public.stock_media
  ADD COLUMN IF NOT EXISTS video_id uuid;

-- Add index for efficient per-video queries
CREATE INDEX IF NOT EXISTS idx_stock_media_video_id 
  ON public.stock_media(video_id);

-- Add composite index for user + video lookups
CREATE INDEX IF NOT EXISTS idx_stock_media_user_video 
  ON public.stock_media(user_id, video_id);

-- =============================================================================
-- 4. Create new match function that filters by user_id and video_id
-- =============================================================================
DROP FUNCTION IF EXISTS public.match_stock_media_for_video(extensions.vector, double precision, integer, uuid, uuid);

CREATE OR REPLACE FUNCTION public.match_stock_media_for_video(
  query_embedding extensions.vector,
  match_threshold double precision,
  match_count integer,
  p_user_id uuid,
  p_video_id uuid
) RETURNS TABLE(
  id uuid,
  r2_key text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql STABLE
SET search_path TO 'extensions'
AS $$
  SELECT
    stock_media.id,
    stock_media.r2_key,
    stock_media.metadata,
    1 - (stock_media.embedding <=> query_embedding) as similarity
  FROM public.stock_media
  WHERE 
    stock_media.embedding IS NOT NULL
    AND stock_media.user_id = p_user_id
    AND stock_media.video_id = p_video_id
    AND 1 - (stock_media.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_stock_media_for_video IS 
  'Vector similarity search for stock media, filtered by user_id and video_id';

-- =============================================================================
-- 5. Also update the original match function to handle null embeddings properly
-- =============================================================================
CREATE OR REPLACE FUNCTION public.match_stock_media(
  query_embedding extensions.vector,
  match_threshold double precision,
  match_count integer
) RETURNS TABLE(
  id uuid,
  r2_key text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql STABLE
SET search_path TO 'extensions'
AS $$
  SELECT
    stock_media.id,
    stock_media.r2_key,
    stock_media.metadata,
    1 - (stock_media.embedding <=> query_embedding) as similarity
  FROM public.stock_media
  WHERE 
    stock_media.embedding IS NOT NULL
    AND 1 - (stock_media.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
