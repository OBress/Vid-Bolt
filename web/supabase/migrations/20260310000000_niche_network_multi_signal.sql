-- ============================================================================
-- Niche Network Multi-Signal Discovery Columns
-- ============================================================================
-- Adds columns for embedding similarity, tag overlap, AI reasoning,
-- shared audience description, and expands discovery_method options.
-- ============================================================================

-- Add new columns for multi-signal scoring
ALTER TABLE public.niche_network_channels
  ADD COLUMN IF NOT EXISTS embedding_similarity NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS tag_overlap_score NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS similarity_reason TEXT,
  ADD COLUMN IF NOT EXISTS shared_audience TEXT;

-- Update discovery_method CHECK constraint to include 'featured_channel'
ALTER TABLE public.niche_network_channels
  DROP CONSTRAINT IF EXISTS niche_network_channels_discovery_method_check;

ALTER TABLE public.niche_network_channels
  ADD CONSTRAINT niche_network_channels_discovery_method_check
  CHECK (discovery_method IN ('keyword_search', 'expansion', 'topic_match', 'manual', 'featured_channel'));
