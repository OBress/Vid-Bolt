-- ============================================================================
-- Migration: Security Fixes
-- ============================================================================
-- 1. Enable RLS on stock_media table
-- 2. Add SET search_path = '' to all public functions for security hardening
-- 3. Note: Extension in public schema (vector) cannot be moved via migration
--    after initial setup - requires manual intervention if needed
-- ============================================================================

-- ============================================================================
-- PART 1: Enable RLS on stock_media (idempotent)
-- ============================================================================

ALTER TABLE public.stock_media ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Authenticated users can view stock media" ON public.stock_media;
DROP POLICY IF EXISTS "Service role can manage stock media" ON public.stock_media;

-- Allow authenticated users to read stock media (shared asset library)
CREATE POLICY "Authenticated users can view stock media"
ON public.stock_media FOR SELECT
TO authenticated
USING (true);

-- Only service_role can insert/update/delete stock media
CREATE POLICY "Service role can manage stock media"
ON public.stock_media FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- PART 2: Fix function search_path for security
-- All SECURITY DEFINER functions should have SET search_path = ''
-- ============================================================================

-- Fix: merge_task_output
CREATE OR REPLACE FUNCTION public.merge_task_output(p_task_id uuid, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks
  SET 
    output_data = COALESCE(output_data, '{}'::jsonb) || p_updates,
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Fix: reset_payment_month
CREATE OR REPLACE FUNCTION public.reset_payment_month(target_user_id uuid, target_month_date text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.monthly_statements
    SET 
        status = 'draft',
        payment_proof_url = NULL,
        updated_at = now()
    WHERE user_id = target_user_id 
      AND month_date = target_month_date::date;
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Statement not found for user % and month %', target_user_id, target_month_date;
    END IF;
END;
$$;

-- Fix: get_admin_analytics
CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    total_users int;
    active_users int;
    pending_users int;
    total_projects int;
    result jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    SELECT count(*) INTO total_users FROM public.users;
    SELECT count(*) INTO active_users FROM public.users WHERE status = 'active';
    SELECT count(*) INTO pending_users FROM public.users WHERE status = 'pending';
    SELECT count(*) INTO total_projects FROM public.video_projects;

    result := jsonb_build_object(
        'total_users', total_users,
        'active_users', active_users,
        'pending_users', pending_users,
        'total_projects', total_projects
    );

    RETURN result;
END;
$$;

-- Fix: protect_admin_column
CREATE OR REPLACE FUNCTION public.protect_admin_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
      RETURN NEW;
    END IF;

    IF (session_user = 'postgres') THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'You are not authorized to change the is_admin status.';
  END IF;
  RETURN NEW;
END;
$$;

-- Fix: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Fix: append_to_output_array
CREATE OR REPLACE FUNCTION public.append_to_output_array(p_task_id uuid, p_key text, p_item jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks
  SET 
    output_data = jsonb_set(
      COALESCE(output_data, '{}'::jsonb),
      ARRAY[p_key],
      COALESCE(output_data->p_key, '[]'::jsonb) || p_item
    ),
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Fix: get_task_step_stats
CREATE OR REPLACE FUNCTION public.get_task_step_stats(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'pending', COUNT(*) FILTER (WHERE step->>'status' = 'pending'),
    'running', COUNT(*) FILTER (WHERE step->>'status' = 'running'),
    'completed', COUNT(*) FILTER (WHERE step->>'status' = 'completed'),
    'failed', COUNT(*) FILTER (WHERE step->>'status' = 'failed'),
    'skipped', COUNT(*) FILTER (WHERE step->>'status' = 'skipped')
  )
  INTO result
  FROM jsonb_array_elements(
    (SELECT COALESCE(steps, '[]'::jsonb) FROM public.tasks WHERE id = p_task_id)
  ) AS step;
  
  RETURN COALESCE(result, '{"total": 0, "pending": 0, "running": 0, "completed": 0, "failed": 0, "skipped": 0}'::jsonb);
END;
$$;

-- Fix: get_users_paginated
CREATE OR REPLACE FUNCTION public.get_users_paginated(page integer DEFAULT 1, per_page integer DEFAULT 20, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text)
RETURNS TABLE(id uuid, email text, name text, username text, is_admin boolean, status public.account_status, date_joined timestamp with time zone, total_count bigint, last_month_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    WITH filtered_users AS (
        SELECT u.*
        FROM public.users u
        WHERE 
            (search_text = '' OR 
             u.email ILIKE '%' || search_text || '%' OR 
             u.name ILIKE '%' || search_text || '%' OR 
             u.username ILIKE '%' || search_text || '%')
            AND
            (status_filter = 'all' OR u.status::text = status_filter)
    )
    SELECT 
        u.id,
        u.email,
        u.name,
        u.username,
        u.is_admin,
        u.status,
        u.date_joined,
        (SELECT count(*) FROM filtered_users)::bigint as total_count,
        COALESCE(
            (
                SELECT ms.status::text
                FROM public.monthly_statements ms 
                WHERE ms.user_id = u.id 
                  AND ms.month_date >= date_trunc('month', now() - interval '1 month')
                ORDER BY ms.month_date DESC
                LIMIT 1
            ), 
            'draft'
        ) as last_month_status
    FROM filtered_users u
    ORDER BY u.date_joined DESC
    LIMIT per_page
    OFFSET (page - 1) * per_page;
END;
$$;

-- Fix: append_task_step
CREATE OR REPLACE FUNCTION public.append_task_step(p_task_id uuid, p_step jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.tasks 
  SET 
    steps = COALESCE(steps, '[]'::jsonb) || p_step,
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Fix: link_task_to_video
CREATE OR REPLACE FUNCTION public.link_task_to_video(p_video_id uuid, p_task_id uuid, p_task_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.video_projects
    SET 
        script_task_id = CASE WHEN p_task_type = 'script' THEN p_task_id ELSE script_task_id END,
        audio_task_id = CASE WHEN p_task_type = 'audio' THEN p_task_id ELSE audio_task_id END,
        video_task_id = CASE WHEN p_task_type = 'video' THEN p_task_id ELSE video_task_id END,
        export_task_id = CASE WHEN p_task_type = 'export' THEN p_task_id ELSE export_task_id END,
        updated_at = now()
    WHERE id = p_video_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video project not found: %', p_video_id;
    END IF;
END;
$$;

-- Fix: verify_payment_month
CREATE OR REPLACE FUNCTION public.verify_payment_month(target_user_id uuid, target_month_date text, proof_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.monthly_statements
    SET 
        status = 'paid',
        payment_proof_url = proof_url,
        updated_at = now()
    WHERE user_id = target_user_id 
      AND month_date = target_month_date::date;
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Statement not found for user % and month %', target_user_id, target_month_date;
    END IF;
END;
$$;

-- Fix: admin_delete_user
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID;
    target_username TEXT;
    target_email TEXT;
    r2_prefixes TEXT[] := ARRAY[]::TEXT[];
    video_record RECORD;
    statement_record RECORD;
    media_record RECORD;
BEGIN
    caller_id := auth.uid();
    
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Cannot delete your own account';
    END IF;
    
    SELECT username, email INTO target_username, target_email 
    FROM public.users WHERE id = target_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    FOR video_record IN 
        SELECT id FROM public.video_projects WHERE user_id = target_user_id
    LOOP
        r2_prefixes := array_append(r2_prefixes, 'audio/' || target_user_id::TEXT || '/' || video_record.id::TEXT || '/');
    END LOOP;
    
    r2_prefixes := array_append(r2_prefixes, 'gpu-api-test/' || target_user_id::TEXT || '/');
    
    FOR statement_record IN 
        SELECT payment_proof_url, revenue_proof_url 
        FROM public.monthly_statements 
        WHERE user_id = target_user_id
          AND (payment_proof_url IS NOT NULL OR revenue_proof_url IS NOT NULL)
    LOOP
        IF statement_record.payment_proof_url IS NOT NULL THEN
            r2_prefixes := array_append(r2_prefixes, statement_record.payment_proof_url);
        END IF;
        IF statement_record.revenue_proof_url IS NOT NULL THEN
            r2_prefixes := array_append(r2_prefixes, statement_record.revenue_proof_url);
        END IF;
    END LOOP;
    
    FOR media_record IN 
        SELECT picture_url FROM public.media_projects 
        WHERE user_id = target_user_id AND picture_url IS NOT NULL
    LOOP
        r2_prefixes := array_append(r2_prefixes, media_record.picture_url);
    END LOOP;
    
    DELETE FROM public.users WHERE id = target_user_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', target_user_id,
        'username', target_username,
        'email', target_email,
        'r2_prefixes', to_jsonb(r2_prefixes),
        'note', 'Caller must also delete from auth.users via Supabase Admin API'
    );
END;
$$;

-- Fix: admin_wipe_user_data
CREATE OR REPLACE FUNCTION public.admin_wipe_user_data(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID;
    target_username TEXT;
    deleted_tasks INT := 0;
    deleted_videos INT := 0;
    deleted_statements INT := 0;
    r2_prefixes TEXT[] := ARRAY[]::TEXT[];
    video_record RECORD;
    statement_record RECORD;
BEGIN
    caller_id := auth.uid();
    
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Cannot wipe your own data';
    END IF;
    
    SELECT username INTO target_username FROM public.users WHERE id = target_user_id;
    IF target_username IS NULL THEN
        SELECT email INTO target_username FROM public.users WHERE id = target_user_id;
    END IF;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    FOR video_record IN 
        SELECT id FROM public.video_projects WHERE user_id = target_user_id
    LOOP
        r2_prefixes := array_append(r2_prefixes, 'audio/' || target_user_id::TEXT || '/' || video_record.id::TEXT || '/');
    END LOOP;
    
    r2_prefixes := array_append(r2_prefixes, 'gpu-api-test/' || target_user_id::TEXT || '/');
    
    FOR statement_record IN 
        SELECT payment_proof_url, revenue_proof_url 
        FROM public.monthly_statements 
        WHERE user_id = target_user_id
          AND (payment_proof_url IS NOT NULL OR revenue_proof_url IS NOT NULL)
    LOOP
        IF statement_record.payment_proof_url IS NOT NULL THEN
            r2_prefixes := array_append(r2_prefixes, statement_record.payment_proof_url);
        END IF;
        IF statement_record.revenue_proof_url IS NOT NULL THEN
            r2_prefixes := array_append(r2_prefixes, statement_record.revenue_proof_url);
        END IF;
    END LOOP;
    
    DELETE FROM public.video_projects WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_videos = ROW_COUNT;
    
    DELETE FROM public.tasks WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_tasks = ROW_COUNT;
    
    DELETE FROM public.monthly_statements WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_statements = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', target_user_id,
        'username', target_username,
        'deleted_tasks', deleted_tasks,
        'deleted_videos', deleted_videos,
        'deleted_statements', deleted_statements,
        'r2_prefixes', to_jsonb(r2_prefixes)
    );
END;
$$;

-- Fix: admin_get_user_for_deletion
CREATE OR REPLACE FUNCTION public.admin_get_user_for_deletion(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    caller_id UUID;
    result JSONB;
    task_count INT;
    video_count INT;
    statement_count INT;
BEGIN
    caller_id := auth.uid();
    
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    SELECT COUNT(*) INTO task_count FROM public.tasks WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO video_count FROM public.video_projects WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO statement_count FROM public.monthly_statements WHERE user_id = target_user_id;
    
    SELECT jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', u.name,
        'username', u.username,
        'status', u.status,
        'is_admin', u.is_admin,
        'date_joined', u.date_joined,
        'task_count', task_count,
        'video_count', video_count,
        'statement_count', statement_count
    ) INTO result
    FROM public.users u
    WHERE u.id = target_user_id;
    
    IF result IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    RETURN result;
END;
$$;

-- Fix: handle_payment_status_change
CREATE OR REPLACE FUNCTION public.handle_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
        NEW.paid_at = now();
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        NEW.paid_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- Fix: update_user_status
CREATE OR REPLACE FUNCTION public.update_user_status(target_user_id uuid, new_status public.account_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    IF target_user_id = auth.uid() AND new_status != 'active' THEN
         RAISE EXCEPTION 'Cannot deactivate your own account';
    END IF;

    UPDATE public.users
    SET status = new_status
    WHERE id = target_user_id;
END;
$$;

-- Fix: update_task_step
CREATE OR REPLACE FUNCTION public.update_task_step(p_task_id uuid, p_step_id text, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_steps JSONB;
BEGIN
  SELECT jsonb_agg(
    CASE 
      WHEN step->>'id' = p_step_id 
      THEN step || p_updates
      ELSE step
    END
    ORDER BY (step->>'order')::int
  )
  INTO updated_steps
  FROM jsonb_array_elements(
    (SELECT COALESCE(steps, '[]'::jsonb) FROM public.tasks WHERE id = p_task_id)
  ) AS step;
  
  UPDATE public.tasks
  SET 
    steps = COALESCE(updated_steps, '[]'::jsonb),
    updated_at = now()
  WHERE id = p_task_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found: %', p_task_id;
  END IF;
END;
$$;

-- Fix: handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$;

-- Fix: match_stock_media (SQL function)
-- Note: Uses search_path = 'public' because vector extension and operators are in public schema
CREATE OR REPLACE FUNCTION public.match_stock_media(query_embedding public.vector, match_threshold double precision, match_count integer)
RETURNS TABLE(id uuid, r2_key text, metadata jsonb, similarity double precision)
LANGUAGE sql
STABLE
SET search_path = 'public'
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

-- Fix: merge_video_metadata
CREATE OR REPLACE FUNCTION public.merge_video_metadata(p_video_id uuid, p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- Fix: update_video_progress
CREATE OR REPLACE FUNCTION public.update_video_progress(p_video_id uuid, p_current_stage text, p_current_step text, p_progress_percent integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.video_projects
    SET 
        current_stage = p_current_stage,
        current_step = p_current_step,
        progress_percent = p_progress_percent,
        updated_at = now(),
        status = CASE 
            WHEN status = 'draft' THEN 'processing'
            WHEN status IN ('completed', 'failed', 'cancelled') THEN status
            ELSE 'processing'
        END,
        completed_at = CASE
            WHEN p_current_stage = 'completed' THEN now()
            ELSE completed_at
        END
    WHERE id = p_video_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Video project not found: %', p_video_id;
    END IF;
END;
$$;

-- Fix: get_user_payment_history
CREATE OR REPLACE FUNCTION public.get_user_payment_history(target_user_id uuid)
RETURNS SETOF public.monthly_statements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.monthly_statements
    WHERE user_id = target_user_id
    ORDER BY month_date DESC;
END;
$$;

-- Fix: get_incomplete_videos
CREATE OR REPLACE FUNCTION public.get_incomplete_videos(p_user_id uuid)
RETURNS TABLE(id uuid, name text, status text, current_stage text, current_step text, progress_percent integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vp.id,
        vp.name,
        vp.status,
        vp.current_stage,
        vp.current_step,
        vp.progress_percent,
        vp.updated_at
    FROM public.video_projects vp
    WHERE 
        vp.user_id = p_user_id
        AND vp.status IN ('draft', 'processing', 'failed')
        AND vp.current_stage != 'completed'
    ORDER BY vp.updated_at DESC;
END;
$$;

-- Fix: handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- ============================================================================
-- NOTE: The vector extension is in public schema. 
-- Moving it after creation is complex and requires recreation of dependent objects.
-- It's recommended to handle this manually if needed:
-- 1. DROP dependent objects (stock_media table, match_stock_media function)
-- 2. DROP EXTENSION vector
-- 3. CREATE EXTENSION vector WITH SCHEMA extensions
-- 4. Recreate dependent objects with extensions.vector type
-- 
-- For leaked password protection: Enable in Supabase Dashboard under
-- Authentication > Settings > Security
-- ============================================================================
