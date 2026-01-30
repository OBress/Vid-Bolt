-- Migration: Add entity_name for deterministic stock media reuse
-- Instead of vector similarity, reuse is based on exact entity name match
--
-- This enables visual consistency: the same person/place uses the same image
-- throughout a video instead of potentially different images from the pool.

-- =============================================================================
-- 1. Add entity_name column (nullable - only set for reusable entities)
-- =============================================================================
ALTER TABLE public.stock_media
  ADD COLUMN IF NOT EXISTS entity_name text;

COMMENT ON COLUMN public.stock_media.entity_name IS 
  'Entity name for deterministic reuse (e.g. "Donald Trump"). When set, this image can be reused for the same entity in future shots.';

-- =============================================================================
-- 2. Add index for fast entity lookups within a video
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_stock_media_video_entity 
  ON public.stock_media(video_id, entity_name) 
  WHERE entity_name IS NOT NULL;

-- =============================================================================
-- 3. RPC function to find stock media by entity name
-- =============================================================================
DROP FUNCTION IF EXISTS public.get_stock_media_by_entity(uuid, text);

CREATE OR REPLACE FUNCTION public.get_stock_media_by_entity(
  p_video_id uuid,
  p_entity_name text
) RETURNS TABLE(
  id uuid,
  r2_key text,
  metadata jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    stock_media.id,
    stock_media.r2_key,
    stock_media.metadata
  FROM public.stock_media
  WHERE 
    stock_media.video_id = p_video_id
    AND stock_media.entity_name = p_entity_name
  ORDER BY stock_media.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_stock_media_by_entity IS 
  'Find stock media by exact entity name match within a video. Returns most recent match.';
