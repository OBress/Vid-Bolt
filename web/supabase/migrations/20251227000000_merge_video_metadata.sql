-- Create a function to merge metadata for video projects
CREATE OR REPLACE FUNCTION public.merge_video_metadata(p_video_id uuid, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.video_projects
  SET 
    metadata = COALESCE(metadata, '{}'::jsonb) || p_updates,
    updated_at = now()
  WHERE id = p_video_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Video project not found: %', p_video_id;
  END IF;
END;
$$;

-- Grant access to the function
ALTER FUNCTION public.merge_video_metadata(uuid, jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.merge_video_metadata(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_video_metadata(uuid, jsonb) TO service_role;
