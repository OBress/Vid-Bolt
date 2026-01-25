-- Migration: Add Pexels and Pixabay sources to stock_media table
-- This migration updates the source constraint to include all supported platforms

-- Drop the existing constraint
ALTER TABLE public.stock_media 
  DROP CONSTRAINT IF EXISTS stock_media_source_check;

-- Add the updated constraint with all sources
ALTER TABLE public.stock_media 
  ADD CONSTRAINT stock_media_source_check 
  CHECK (source = ANY (ARRAY['wikimedia', 'youtube', 'pixabay', 'pexels', 'google', 'other']::text[]));

-- Comment for documentation
COMMENT ON CONSTRAINT stock_media_source_check ON public.stock_media IS 
  'Allowed sources: wikimedia (Commons), youtube (video clips), pixabay (images/videos), pexels (images/videos), google (Custom Search), other';
