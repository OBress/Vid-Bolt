-- ============================================================================
-- Migration: Deep Merge for merge_video_metadata
-- ============================================================================
-- Problem: The existing merge_video_metadata uses JSONB || which is a SHALLOW
-- merge. When called with { generated_videos: { "shot-17": url } }, it
-- REPLACES the entire generated_videos key instead of adding shot-17.
-- This destroys all previously generated video URLs.
--
-- Fix: Create a recursive jsonb_deep_merge function and update
-- merge_video_metadata to use it instead of ||.
-- ============================================================================

-- 1. Create the recursive deep merge helper
-- Note: "overlay" and "base" are reserved words in PostgreSQL, so we use
-- base_val/updates_val as parameter names.
CREATE OR REPLACE FUNCTION public.jsonb_deep_merge(base_val jsonb, updates_val jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  result jsonb := base_val;
  key text;
  bv jsonb;
  uv jsonb;
BEGIN
  -- Iterate over all keys in the updates
  FOR key IN SELECT jsonb_object_keys(updates_val)
  LOOP
    uv := updates_val -> key;
    bv := result -> key;

    -- If both values are objects, recurse
    IF bv IS NOT NULL
       AND jsonb_typeof(bv) = 'object'
       AND jsonb_typeof(uv) = 'object'
    THEN
      result := jsonb_set(result, ARRAY[key], public.jsonb_deep_merge(bv, uv));
    ELSE
      -- Otherwise updates value wins (same as || for non-object values)
      result := jsonb_set(result, ARRAY[key], uv);
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- 2. Update merge_video_metadata to use deep merge
CREATE OR REPLACE FUNCTION public.merge_video_metadata(p_video_id uuid, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.video_projects
  SET
    metadata = public.jsonb_deep_merge(COALESCE(metadata, '{}'::jsonb), p_updates),
    updated_at = now()
  WHERE id = p_video_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video project not found: %', p_video_id;
  END IF;
END;
$$;

-- 3. Grant permissions on the new helper function
ALTER FUNCTION public.jsonb_deep_merge(jsonb, jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.jsonb_deep_merge(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_deep_merge(jsonb, jsonb) TO service_role;
