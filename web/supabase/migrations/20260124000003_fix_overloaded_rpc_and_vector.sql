-- ============================================================================
-- Migration: Fix Overloaded Function and Move Vector Extension
-- ============================================================================
-- 1. Drop old insecure overloaded function: verify_payment_month(uuid, date)
-- 2. Move 'vector' extension from 'public' to 'extensions' schema safely
-- ============================================================================

-- ============================================================================
-- PART 1: Drop old overloaded function
-- ============================================================================

-- This function signature was replaced by (uuid, text, text) but not dropped,
-- causing a mutable search_path warning.
DROP FUNCTION IF EXISTS public.verify_payment_month(uuid, date);


-- ============================================================================
-- PART 2: Move vector extension to extensions schema
-- ============================================================================

-- 1. Backup existing stock_media data
-- We cast embedding to real[] (float array) to preserve data while dropping the vector type
CREATE TABLE IF NOT EXISTS public.stock_media_backup AS 
SELECT 
    id, 
    source, 
    external_id, 
    r2_key, 
    metadata, 
    embedding::real[] as embedding_data, 
    created_at 
FROM public.stock_media;

-- 2. Drop dependent objects
DROP FUNCTION IF EXISTS public.match_stock_media(public.vector, double precision, integer);
-- Drop table (will drop its policies and indexes too)
DROP TABLE IF EXISTS public.stock_media;

-- 3. Drop extension from public schema
DROP EXTENSION IF EXISTS vector;

-- 4. Re-create extension in extensions schema
-- Ensure extensions schema exists
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 5. Recreate stock_media table using extensions.vector type
CREATE TABLE public.stock_media (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('wikimedia', 'youtube', 'other')),
  external_id text,
  r2_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding extensions.vector(768), -- Usage: extensions.vector
  created_at timestamptz default now()
);

-- 6. Restore data
INSERT INTO public.stock_media (id, source, external_id, r2_key, metadata, embedding, created_at)
SELECT 
    id, 
    source, 
    external_id, 
    r2_key, 
    metadata, 
    embedding_data::extensions.vector, -- Cast back to vector
    created_at 
FROM public.stock_media_backup;

-- 7. Cleanup backup
DROP TABLE public.stock_media_backup;

-- 8. Re-enable RLS 
ALTER TABLE public.stock_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stock media"
ON public.stock_media FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can manage stock media"
ON public.stock_media FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 9. Recreate match function using correct schema and search_path
-- We assume extensions schema has the vector operators
CREATE OR REPLACE FUNCTION public.match_stock_media(
    query_embedding extensions.vector, 
    match_threshold double precision, 
    match_count integer
)
RETURNS TABLE(id uuid, r2_key text, metadata jsonb, similarity double precision)
LANGUAGE sql
STABLE
SET search_path = 'extensions' -- Need this to find <=> operator
AS $$
  select
    stock_media.id,
    stock_media.r2_key,
    stock_media.metadata,
    1 - (stock_media.embedding <=> query_embedding) as similarity
  from public.stock_media
  where 1 - (stock_media.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- 10. Recreate index
CREATE INDEX ON public.stock_media USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- ============================================================================
-- Migration complete
-- ============================================================================
