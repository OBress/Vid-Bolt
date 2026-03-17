


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "moddatetime" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "extensions";






CREATE TYPE "public"."account_status" AS ENUM (
    'pending',
    'active',
    'paused',
    'banned'
);


ALTER TYPE "public"."account_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'draft',
    'pending_verification',
    'paid'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_ban_user"("target_user_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  caller_id UUID;
  v_email TEXT;
  v_discord_id TEXT;
  v_username TEXT;
  v_ban_id UUID;
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
    RAISE EXCEPTION 'Cannot ban your own account';
  END IF;

  -- Get user identifiers before deletion
  SELECT u.email, u.discord_id, u.username
  INTO v_email, v_discord_id, v_username
  FROM public.users u WHERE u.id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;

  -- Insert into banned_identities
  INSERT INTO public.banned_identities (email, discord_id, banned_by, reason)
  VALUES (v_email, v_discord_id, caller_id, p_reason)
  RETURNING id INTO v_ban_id;

  -- Collect R2 prefixes for cleanup (same logic as admin_delete_user)
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

  -- Delete user from public.users (cascades to child tables)
  DELETE FROM public.users WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'username', v_username,
    'email', v_email,
    'discord_id', v_discord_id,
    'ban_id', v_ban_id,
    'r2_prefixes', to_jsonb(r2_prefixes),
    'note', 'Caller must also delete from auth.users via Supabase Admin API'
  );
END;
$$;


ALTER FUNCTION "public"."admin_ban_user"("target_user_id" "uuid", "p_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_ban_user"("target_user_id" "uuid", "p_reason" "text") IS 'Bans a user by persisting their email + discord_id in banned_identities, then deletes from public.users. Caller must also delete from auth.users.';



CREATE OR REPLACE FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") IS 'Admin function to fully delete a user from the system.
Deletes the user from public.users which cascades to most related tables.
Returns R2 prefixes that need cleanup.
IMPORTANT: Caller must also delete from auth.users via Supabase Admin API.';



CREATE OR REPLACE FUNCTION "public"."admin_get_user_for_deletion"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_get_user_for_deletion"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_get_user_for_deletion"("target_user_id" "uuid") IS 'Admin function to get user details and data counts for the deletion confirmation dialog.';



CREATE OR REPLACE FUNCTION "public"."admin_unban_identity"("p_banned_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  DELETE FROM public.banned_identities WHERE id = p_banned_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Banned identity not found: %', p_banned_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."admin_unban_identity"("p_banned_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_unban_identity"("p_banned_id" "uuid") IS 'Removes an identity from the ban list, allowing the user to re-register.';



CREATE OR REPLACE FUNCTION "public"."admin_wipe_user_data"("target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_wipe_user_data"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_wipe_user_data"("target_user_id" "uuid") IS 'Admin function to wipe all user-generated content while preserving the account.
Deletes: tasks, video_projects, monthly_statements
Keeps: users, user_api_keys, user_settings, user_gcp_config, media_projects
Returns R2 prefixes that need cleanup.';



CREATE OR REPLACE FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_approve_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.is_admin = true AND NEW.status != 'active' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_approve_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_banned_identity"("p_email" "text" DEFAULT NULL::"text", "p_discord_id" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.banned_identities bi
    WHERE
      (p_email IS NOT NULL AND bi.email = p_email)
      OR
      (p_discord_id IS NOT NULL AND bi.discord_id = p_discord_id)
  );
END;
$$;


ALTER FUNCTION "public"."check_banned_identity"("p_email" "text", "p_discord_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_banned_identity"("p_email" "text", "p_discord_id" "text") IS 'Returns true if the given email or discord_id is in the ban list. Called from the auth callback on every login.';



CREATE OR REPLACE FUNCTION "public"."credit_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_stripe_session_id" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_new_balance INTEGER;
  v_existing_txn UUID;
BEGIN
  -- Validate inputs
  IF p_hours <= 0 THEN
    RAISE EXCEPTION 'Hours must be positive, got %', p_hours;
  END IF;

  -- Idempotency check: skip if this stripe session already credited
  IF p_stripe_session_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn
    FROM gpu_hours_transactions
    WHERE stripe_session_id = p_stripe_session_id
      AND type = 'purchase'
    LIMIT 1;

    IF v_existing_txn IS NOT NULL THEN
      -- Already processed, return current balance
      SELECT gpu_hours_balance INTO v_new_balance
      FROM users WHERE id = p_user_id;
      RETURN v_new_balance;
    END IF;
  END IF;

  -- Atomically update balance
  UPDATE users
  SET gpu_hours_balance = gpu_hours_balance + p_hours
  WHERE id = p_user_id
  RETURNING gpu_hours_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Insert ledger entry
  INSERT INTO gpu_hours_transactions (user_id, type, hours, balance_after, stripe_session_id, description)
  VALUES (p_user_id, 'purchase', p_hours, v_new_balance, p_stripe_session_id,
          format('Purchased %s GPU hours via Stripe', p_hours));

  RETURN v_new_balance;
END;
$$;


ALTER FUNCTION "public"."credit_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_stripe_session_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."credit_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_stripe_session_id" "text") IS 'Atomically credits GPU hours to a user after a Stripe purchase. Idempotent on stripe_session_id.';



CREATE OR REPLACE FUNCTION "public"."deduct_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_video_id" "uuid" DEFAULT NULL::"uuid", "p_description" "text" DEFAULT 'Video render'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate inputs
  IF p_hours <= 0 THEN
    RAISE EXCEPTION 'Hours must be positive, got %', p_hours;
  END IF;

  -- Lock the row and check balance
  SELECT gpu_hours_balance INTO v_current_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  IF v_current_balance < p_hours THEN
    RAISE EXCEPTION 'Insufficient GPU hours: have %, need %', v_current_balance, p_hours;
  END IF;

  -- Deduct
  v_new_balance := v_current_balance - p_hours;

  UPDATE users
  SET gpu_hours_balance = v_new_balance
  WHERE id = p_user_id;

  -- Insert ledger entry (negative hours for deduction)
  INSERT INTO gpu_hours_transactions (user_id, type, hours, balance_after, video_id, description)
  VALUES (p_user_id, 'deduction', -p_hours, v_new_balance, p_video_id, p_description);

  RETURN v_new_balance;
END;
$$;


ALTER FUNCTION "public"."deduct_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_video_id" "uuid", "p_description" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."deduct_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_video_id" "uuid", "p_description" "text") IS 'Atomically deducts GPU hours from a user for rendering. Uses SELECT FOR UPDATE to prevent race conditions. Raises exception if insufficient balance.';



CREATE OR REPLACE FUNCTION "public"."get_admin_analytics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_admin_analytics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_banned_identities"("page" integer DEFAULT 1, "per_page" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "email" "text", "discord_id" "text", "banned_by_name" "text", "reason" "text", "created_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    bi.id,
    bi.email,
    bi.discord_id,
    COALESCE(u.name, u.username, u.email) AS banned_by_name,
    bi.reason,
    bi.created_at,
    (SELECT count(*) FROM public.banned_identities)::BIGINT AS total_count
  FROM public.banned_identities bi
  LEFT JOIN public.users u ON u.id = bi.banned_by
  ORDER BY bi.created_at DESC
  LIMIT per_page
  OFFSET (page - 1) * per_page;
END;
$$;


ALTER FUNCTION "public"."get_banned_identities"("page" integer, "per_page" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_banned_identities"("page" integer, "per_page" integer) IS 'Paginated list of banned identities for the admin panel.';



CREATE OR REPLACE FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "status" "text", "current_stage" "text", "current_step" "text", "progress_percent" integer, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_request_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    )
  );
$$;


ALTER FUNCTION "public"."get_request_role"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_request_role"() IS 'Returns the JWT role claim, checking both old (request.jwt.claim.role) and new (request.jwt.claims JSON) PostgREST formats.';



CREATE OR REPLACE FUNCTION "public"."get_stock_media_by_entity"("p_video_id" "uuid", "p_entity_name" "text") RETURNS TABLE("id" "uuid", "r2_key" "text", "metadata" "jsonb")
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_stock_media_by_entity"("p_video_id" "uuid", "p_entity_name" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_stock_media_by_entity"("p_video_id" "uuid", "p_entity_name" "text") IS 'Find stock media by exact entity name match within a video. Returns most recent match.';



CREATE OR REPLACE FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."monthly_statements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "month_date" "date" NOT NULL,
    "total_revenue" numeric DEFAULT 0,
    "costs" "jsonb" DEFAULT '[]'::"jsonb",
    "commission_rate" numeric DEFAULT 0.1,
    "status" "public"."payment_status" DEFAULT 'draft'::"public"."payment_status",
    "payment_proof_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "revenue_proof_url" "text",
    "paid_at" timestamp with time zone
);


ALTER TABLE "public"."monthly_statements" OWNER TO "postgres";


COMMENT ON COLUMN "public"."monthly_statements"."costs" IS 'JSON: [{id, name, amount}] or legacy [{title, amount_usd}]';



CREATE OR REPLACE FUNCTION "public"."get_user_payment_history"("target_user_id" "uuid") RETURNS SETOF "public"."monthly_statements"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."get_user_payment_history"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_users_paginated"("page" integer DEFAULT 1, "per_page" integer DEFAULT 20, "search_text" "text" DEFAULT ''::"text", "status_filter" "text" DEFAULT 'all'::"text") RETURNS TABLE("id" "uuid", "email" "text", "name" "text", "username" "text", "is_admin" boolean, "status" "public"."account_status", "date_joined" timestamp with time zone, "total_count" bigint, "last_month_status" "text", "discord_username" "text", "discord_avatar" "text", "in_vidbolt_server" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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
             u.username ILIKE '%' || search_text || '%' OR
             u.discord_username ILIKE '%' || search_text || '%')
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
        ) as last_month_status,
        u.discord_username,
        u.discord_avatar,
        u.in_vidbolt_server
    FROM filtered_users u
    ORDER BY u.date_joined DESC
    LIMIT per_page
    OFFSET (page - 1) * per_page;
END;
$$;


ALTER FUNCTION "public"."get_users_paginated"("page" integer, "per_page" integer, "search_text" "text", "status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_payment_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."handle_payment_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_task_to_video"("p_video_id" "uuid", "p_task_id" "uuid", "p_task_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."link_task_to_video"("p_video_id" "uuid", "p_task_id" "uuid", "p_task_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_stock_media"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) RETURNS TABLE("id" "uuid", "r2_key" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'extensions'
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


ALTER FUNCTION "public"."match_stock_media"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_stock_media_for_video"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "p_user_id" "uuid", "p_video_id" "uuid") RETURNS TABLE("id" "uuid", "r2_key" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'extensions'
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


ALTER FUNCTION "public"."match_stock_media_for_video"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "p_user_id" "uuid", "p_video_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."match_stock_media_for_video"("query_embedding" "extensions"."vector", "match_threshold" double precision, "match_count" integer, "p_user_id" "uuid", "p_video_id" "uuid") IS 'Vector similarity search for stock media, filtered by user_id and video_id';



CREATE OR REPLACE FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merge_video_metadata"("p_video_id" "uuid", "p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."merge_video_metadata"("p_video_id" "uuid", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_monthly_statements_sensitive_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    RAISE EXCEPTION 'Permission denied: cannot modify commission_rate';
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify paid_at';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'draft' AND NEW.status = 'pending_verification') THEN
      RAISE EXCEPTION 'Permission denied: invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_monthly_statements_sensitive_columns"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_monthly_statements_sensitive_columns"() IS 'Blocks non-service-role callers from modifying commission_rate and paid_at. Restricts status transitions to draft→pending_verification only.';



CREATE OR REPLACE FUNCTION "public"."protect_tasks_sensitive_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.status';
  END IF;
  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.current_phase';
  END IF;
  IF NEW.current_step IS DISTINCT FROM OLD.current_step THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.current_step';
  END IF;
  IF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.progress_percent';
  END IF;
  IF NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.error_message';
  END IF;
  IF NEW.retry_count IS DISTINCT FROM OLD.retry_count THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.retry_count';
  END IF;
  IF NEW.max_retries IS DISTINCT FROM OLD.max_retries THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.max_retries';
  END IF;
  IF NEW.inngest_run_id IS DISTINCT FROM OLD.inngest_run_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.inngest_run_id';
  END IF;
  IF NEW.output_data IS DISTINCT FROM OLD.output_data THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.output_data';
  END IF;
  IF NEW.steps IS DISTINCT FROM OLD.steps THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.steps';
  END IF;
  IF NEW.research IS DISTINCT FROM OLD.research THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.research';
  END IF;
  IF NEW.master_outline IS DISTINCT FROM OLD.master_outline THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.master_outline';
  END IF;
  IF NEW.detailed_outline IS DISTINCT FROM OLD.detailed_outline THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.detailed_outline';
  END IF;
  IF NEW.characters IS DISTINCT FROM OLD.characters THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.characters';
  END IF;
  IF NEW.settings IS DISTINCT FROM OLD.settings THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.settings';
  END IF;
  IF NEW.chapters IS DISTINCT FROM OLD.chapters THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.chapters';
  END IF;
  IF NEW.final_script IS DISTINCT FROM OLD.final_script THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.final_script';
  END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.started_at';
  END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.completed_at';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_tasks_sensitive_columns"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_tasks_sensitive_columns"() IS 'Blocks non-service-role callers from modifying pipeline-managed task columns. Users can only modify: name, input_data.';



CREATE OR REPLACE FUNCTION "public"."protect_user_gcp_config_sensitive_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.gcp_refresh_token IS DISTINCT FROM OLD.gcp_refresh_token THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_refresh_token';
  END IF;
  IF NEW.gcp_access_token IS DISTINCT FROM OLD.gcp_access_token THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_access_token';
  END IF;
  IF NEW.gcp_token_expires_at IS DISTINCT FROM OLD.gcp_token_expires_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_token_expires_at';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify user_gcp_config.status';
  END IF;
  IF NEW.external_ip IS DISTINCT FROM OLD.external_ip THEN
    RAISE EXCEPTION 'Permission denied: cannot modify external_ip';
  END IF;
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify last_seen_at';
  END IF;
  IF NEW.last_gpu_activity_at IS DISTINCT FROM OLD.last_gpu_activity_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify last_gpu_activity_at';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_user_gcp_config_sensitive_columns"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_user_gcp_config_sensitive_columns"() IS 'Blocks non-service-role callers from modifying GCP tokens and server-managed state. Users can modify: project_id, region, zone, instance_name, machine_type, gpu_auto_shutdown_minutes, metadata, updated_at.';



CREATE OR REPLACE FUNCTION "public"."protect_users_sensitive_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Allow service_role (API calls from workers/server)
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Allow Supabase dashboard / direct SQL (postgres, supabase_admin)
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Permission denied: cannot modify is_admin';
  END IF;
  IF NEW.gpu_hours_balance IS DISTINCT FROM OLD.gpu_hours_balance THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gpu_hours_balance';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify stripe_customer_id';
  END IF;
  IF NEW.account_tier IS DISTINCT FROM OLD.account_tier THEN
    RAISE EXCEPTION 'Permission denied: cannot modify account_tier';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify status';
  END IF;
  IF NEW.date_joined IS DISTINCT FROM OLD.date_joined THEN
    RAISE EXCEPTION 'Permission denied: cannot modify date_joined';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Permission denied: cannot modify email';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_users_sensitive_columns"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_users_sensitive_columns"() IS 'Blocks non-service-role callers from modifying sensitive user columns (is_admin, credits, account_tier, status, date_joined, email). Users can only modify: name, username, hashid, joining_reason, onboarding_completed.';



CREATE OR REPLACE FUNCTION "public"."protect_video_projects_sensitive_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Allow service_role full access
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Block changes to pipeline-managed columns
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.status';
  END IF;

  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.current_stage';
  END IF;

  IF NEW.current_step IS DISTINCT FROM OLD.current_step THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.current_step';
  END IF;

  IF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.progress_percent';
  END IF;

  IF NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.metadata';
  END IF;

  IF NEW.script_content IS DISTINCT FROM OLD.script_content THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.script_content';
  END IF;

  IF NEW.script_task_id IS DISTINCT FROM OLD.script_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.script_task_id';
  END IF;

  IF NEW.audio_task_id IS DISTINCT FROM OLD.audio_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.audio_task_id';
  END IF;

  IF NEW.video_task_id IS DISTINCT FROM OLD.video_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.video_task_id';
  END IF;

  IF NEW.export_task_id IS DISTINCT FROM OLD.export_task_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify video_projects.export_task_id';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_video_projects_sensitive_columns"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."protect_video_projects_sensitive_columns"() IS 'Blocks non-service-role callers from modifying pipeline-managed video project columns. Users can only modify: name, idea, notes.';



CREATE OR REPLACE FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_render_jobs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_render_jobs_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_status"("target_user_id" "uuid", "new_status" "public"."account_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."update_user_status"("target_user_id" "uuid", "new_status" "public"."account_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_video_progress"("p_video_id" "uuid", "p_current_stage" "text", "p_current_step" "text", "p_progress_percent" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."update_video_progress"("p_video_id" "uuid", "p_current_stage" "text", "p_current_step" "text", "p_progress_percent" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_video_project_state_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_video_project_state_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "text", "proof_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "text", "proof_url" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_id" "uuid",
    "sync_type" "text" NOT NULL,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "records_synced" integer DEFAULT 0,
    "quota_used" integer DEFAULT 0,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    CONSTRAINT "analytics_sync_log_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"]))),
    CONSTRAINT "analytics_sync_log_sync_type_check" CHECK (("sync_type" = ANY (ARRAY['channel_stats'::"text", 'daily_snapshot'::"text", 'video_analytics'::"text", 'demographics'::"text", 'full_sync'::"text", 'competitor_sync'::"text", 'platform_aggregate'::"text", 'niche_discovery'::"text"])))
);


ALTER TABLE "public"."analytics_sync_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banned_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text",
    "discord_id" "text",
    "banned_by" "uuid",
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."banned_identities" OWNER TO "postgres";


COMMENT ON TABLE "public"."banned_identities" IS 'Persistent ban list that survives account deletion. Checked on every Discord OAuth login.';



CREATE TABLE IF NOT EXISTS "public"."competitor_channel_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "competitor_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "subscriber_count" bigint,
    "view_count" bigint,
    "video_count" integer,
    "recent_avg_views" bigint,
    "recent_avg_likes" integer,
    "recent_avg_comments" integer,
    "engagement_rate" numeric(8,4),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."competitor_channel_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."competitor_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_id" "text" NOT NULL,
    "channel_title" "text",
    "channel_handle" "text",
    "thumbnail_url" "text",
    "banner_url" "text",
    "subscriber_count" bigint DEFAULT 0,
    "view_count" bigint DEFAULT 0,
    "video_count" integer DEFAULT 0,
    "avg_views_per_video" bigint DEFAULT 0,
    "upload_frequency" numeric(5,2),
    "niche_tags" "text"[] DEFAULT '{}'::"text"[],
    "label" "text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."competitor_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."continuity_state" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "current_chapter" integer DEFAULT 0 NOT NULL,
    "total_chapters" integer DEFAULT 1 NOT NULL,
    "events" "jsonb" DEFAULT '[]'::"jsonb",
    "characters" "jsonb" DEFAULT '{}'::"jsonb",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "plot_points" "jsonb" DEFAULT '[]'::"jsonb",
    "story_synopsis" "text",
    "previous_chapter_summary" "text",
    "future_chapter_hints" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."continuity_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gpu_hours_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "hours" integer NOT NULL,
    "balance_after" integer NOT NULL,
    "stripe_session_id" "text",
    "video_id" "uuid",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gpu_hours_transactions_type_check" CHECK (("type" = ANY (ARRAY['purchase'::"text", 'deduction'::"text", 'refund'::"text", 'admin_adjustment'::"text"])))
);


ALTER TABLE "public"."gpu_hours_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "picture_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."media_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."niche_network_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_id" "text" NOT NULL,
    "channel_title" "text",
    "channel_handle" "text",
    "thumbnail_url" "text",
    "subscriber_count" bigint DEFAULT 0,
    "view_count" bigint DEFAULT 0,
    "video_count" integer DEFAULT 0,
    "discovery_method" "text" NOT NULL,
    "discovery_keywords" "text"[] DEFAULT '{}'::"text"[],
    "similarity_score" numeric(5,4) DEFAULT 0,
    "shared_topics" "text"[] DEFAULT '{}'::"text"[],
    "topic_categories" "text"[] DEFAULT '{}'::"text"[],
    "growth_rate_30d" numeric(8,4),
    "avg_views_recent" bigint,
    "upload_frequency" numeric(5,2),
    "channel_created_at" timestamp with time zone,
    "is_emerging" boolean DEFAULT false,
    "graph_x" numeric(10,4),
    "graph_y" numeric(10,4),
    "graph_cluster" integer,
    "last_discovered_at" timestamp with time zone DEFAULT "now"(),
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "embedding_similarity" numeric(5,4),
    "tag_overlap_score" numeric(5,4),
    "similarity_reason" "text",
    "shared_audience" "text",
    CONSTRAINT "niche_network_channels_discovery_method_check" CHECK (("discovery_method" = ANY (ARRAY['keyword_search'::"text", 'expansion'::"text", 'topic_match'::"text", 'manual'::"text", 'featured_channel'::"text"])))
);


ALTER TABLE "public"."niche_network_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."niche_network_edges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_channel" "text" NOT NULL,
    "target_channel" "text" NOT NULL,
    "weight" numeric(5,4) DEFAULT 0,
    "shared_keywords" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."niche_network_edges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_gpu_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "video_id" "uuid" NOT NULL,
    "job_type" "text" NOT NULL,
    "target_queue" "text" NOT NULL,
    "job_data" "jsonb" NOT NULL,
    "task_id" "uuid",
    "priority" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "dispatched_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "pending_gpu_jobs_job_type_check" CHECK (("job_type" = ANY (ARRAY['asset_reference_images'::"text", 'image_generation'::"text", 'image_editing'::"text", 'video_generation'::"text"]))),
    CONSTRAINT "pending_gpu_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'dispatched'::"text", 'failed'::"text", 'expired'::"text"]))),
    CONSTRAINT "pending_gpu_jobs_target_queue_check" CHECK (("target_queue" = ANY (ARRAY['asset-reference-images'::"text", 'gpu-image-create'::"text", 'gpu-image-edit'::"text", 'gpu-ltx2-create'::"text"])))
);


ALTER TABLE "public"."pending_gpu_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."pending_gpu_jobs" IS 'Stores GPU jobs waiting for VM readiness. Jobs are dispatched automatically when VM becomes ready via GCP startup webhook.';



CREATE TABLE IF NOT EXISTS "public"."platform_analytics_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "total_users" integer,
    "active_users" integer,
    "pending_users" integer,
    "new_users_today" integer,
    "videos_created" integer DEFAULT 0,
    "videos_completed" integer DEFAULT 0,
    "scripts_generated" integer DEFAULT 0,
    "renders_completed" integer DEFAULT 0,
    "renders_failed" integer DEFAULT 0,
    "gpu_hours_purchased" integer DEFAULT 0,
    "gpu_hours_consumed" integer DEFAULT 0,
    "gpu_revenue_usd" numeric(10,2) DEFAULT 0,
    "total_yt_views" bigint DEFAULT 0,
    "total_yt_subs" bigint DEFAULT 0,
    "total_yt_videos" integer DEFAULT 0,
    "total_yt_revenue" numeric(12,2) DEFAULT 0,
    "avg_render_time_ms" integer,
    "api_errors_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."platform_analytics_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "reference_url" "text",
    "text_description" "text" DEFAULT ''::"text" NOT NULL,
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "appearance_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_entities_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['character'::"text", 'setting'::"text", 'prop'::"text", 'style'::"text"])))
);


ALTER TABLE "public"."project_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{"voice": {}, "export": {}, "editing": {}, "visuals": {}, "basic_info": {}}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."render_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "video_id" "text" NOT NULL,
    "bullmq_job_id" "text",
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "render_id" "text",
    "bucket_name" "text",
    "output_key" "text",
    "output_url" "text",
    "output_size_bytes" bigint,
    "error_message" "text",
    "composition_id" "text" DEFAULT 'VideoComposition'::"text",
    "width" integer,
    "height" integer,
    "fps" integer,
    "duration_frames" integer,
    "cost_accrued" numeric(10,6),
    "cost_display" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "render_jobs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'rendering'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."render_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."social_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_email" "text",
    "provider_name" "text",
    "provider_avatar" "text",
    "refresh_token" "text",
    "access_token" "text",
    "token_expires_at" timestamp with time zone,
    "scopes" "text"[],
    "is_primary" boolean DEFAULT false,
    "connected_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "social_connections_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'tiktok'::"text", 'instagram'::"text", 'x'::"text", 'facebook'::"text", 'snapchat'::"text", 'spotify'::"text"])))
);


ALTER TABLE "public"."social_connections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "external_id" "text",
    "r2_key" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "embedding" "extensions"."vector"(768),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "user_id" "uuid",
    "video_id" "uuid",
    "entity_name" "text",
    CONSTRAINT "stock_media_source_check" CHECK (("source" = ANY (ARRAY['wikimedia'::"text", 'youtube'::"text", 'pixabay'::"text", 'pexels'::"text", 'google'::"text", 'serper'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."stock_media" OWNER TO "postgres";


COMMENT ON COLUMN "public"."stock_media"."entity_name" IS 'Entity name for deterministic reuse (e.g. "Donald Trump"). When set, this image can be reused for the same entity in future shots.';



COMMENT ON CONSTRAINT "stock_media_source_check" ON "public"."stock_media" IS 'Allowed sources: wikimedia, youtube, pixabay, pexels, google, serper (Google Images via Serper API), other';



CREATE TABLE IF NOT EXISTS "public"."task_steps" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "phase" "text" NOT NULL,
    "step_name" "text" NOT NULL,
    "step_order" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "input_data" "jsonb" DEFAULT '{}'::"jsonb",
    "output_data" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "duration_ms" integer,
    "token_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "task_steps_phase_check" CHECK (("phase" = ANY (ARRAY['preprocessing'::"text", 'writing'::"text", 'postprocessing'::"text"]))),
    CONSTRAINT "task_steps_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."task_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "type" "text" DEFAULT 'writing_workflow'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "current_phase" "text",
    "current_step" "text",
    "progress_percent" integer DEFAULT 0,
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "input_data" "jsonb" DEFAULT '{}'::"jsonb",
    "output_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "research" "text",
    "master_outline" "jsonb",
    "detailed_outline" "jsonb",
    "characters" "jsonb" DEFAULT '[]'::"jsonb",
    "settings" "jsonb" DEFAULT '[]'::"jsonb",
    "chapters" "jsonb" DEFAULT '[]'::"jsonb",
    "final_script" "text",
    "steps" "jsonb" DEFAULT '[]'::"jsonb",
    CONSTRAINT "tasks_current_phase_check" CHECK ((("current_phase" IS NULL) OR ("current_phase" = ANY (ARRAY['preprocessing'::"text", 'writing'::"text", 'postprocessing'::"text", 'audio_generation'::"text", 'audio_processing'::"text", 'image_generation'::"text", 'image_editing'::"text", 'video_generation'::"text", 'compositing'::"text", 'encoding'::"text", 'uploading'::"text", 'research'::"text", 'scoping'::"text", 'spine'::"text", 'assets'::"text", 'expansion'::"text", 'assembly'::"text"])))),
    CONSTRAINT "tasks_progress_percent_check" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tasks_type_check" CHECK (("type" = ANY (ARRAY['writing'::"text", 'writing_workflow'::"text", 'audio'::"text", 'video'::"text", 'export'::"text", 'outline'::"text", 'script_writing'::"text", 'av_script_part1'::"text", 'av_script_part2'::"text", 'edit_assembly'::"text", 'closed_loop'::"text", 'niche_discovery'::"text"])))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tasks"."research" IS 'Research notes for the story (plain text)';



COMMENT ON COLUMN "public"."tasks"."master_outline" IS 'JSON: {title, synopsis, chapters[{chapterNumber, title, summary, keyEvents[]}]}';



COMMENT ON COLUMN "public"."tasks"."detailed_outline" IS 'JSON: Enhanced chapter outlines with detailed beats';



COMMENT ON COLUMN "public"."tasks"."characters" IS 'JSON array: [{name, description, role, traits[]}]';



COMMENT ON COLUMN "public"."tasks"."settings" IS 'JSON array: [{name, description, significance}]';



COMMENT ON COLUMN "public"."tasks"."chapters" IS 'JSON array: [{chapterNumber, title, content}] - supports 15k+ word scripts';



COMMENT ON COLUMN "public"."tasks"."final_script" IS 'Final processed script ready for TTS (plain text)';



COMMENT ON COLUMN "public"."tasks"."steps" IS 'JSONB array of task steps: [{id, name, phase, order, status, started_at, completed_at, duration_ms, token_count, error}]';



CREATE TABLE IF NOT EXISTS "public"."user_api_keys" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "openrouter_key" "text",
    "elevenlabs_key" "text",
    "genai_key" "text",
    "inworld_tts_key" "text",
    "replicate_key" "text",
    "google_cloud_credentials" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "groq_key" "text",
    "valyu_key" "text"
);


ALTER TABLE "public"."user_api_keys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_api_keys"."groq_key" IS 'Groq API key for Whisper transcription with word-level timestamps';



COMMENT ON COLUMN "public"."user_api_keys"."valyu_key" IS 'Valyu API key for research search and DeepResearch features';



CREATE TABLE IF NOT EXISTS "public"."user_gcp_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "text",
    "region" "text" DEFAULT 'us-east4'::"text",
    "zone" "text" DEFAULT 'us-east4-c'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "instance_name" "text" DEFAULT 'vidbolt-workflow'::"text",
    "machine_type" "text",
    "external_ip" "text",
    "status" "text" DEFAULT 'STOPPED'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "gcp_refresh_token" "text",
    "gcp_token_expires_at" timestamp with time zone,
    "gcp_access_token" "text",
    "gpu_auto_shutdown_minutes" integer DEFAULT 60,
    "last_gpu_activity_at" timestamp with time zone DEFAULT "now"(),
    "youtube_oauth_client_id" "text",
    "youtube_oauth_client_secret" "text",
    "youtube_refresh_token" "text",
    "youtube_access_token" "text",
    "youtube_token_expires_at" timestamp with time zone,
    "youtube_oauth_verified" boolean DEFAULT false,
    CONSTRAINT "gpu_auto_shutdown_minutes_range" CHECK ((("gpu_auto_shutdown_minutes" >= 10) AND ("gpu_auto_shutdown_minutes" <= 600)))
);


ALTER TABLE "public"."user_gcp_config" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_gcp_config"."gcp_refresh_token" IS 'Encrypted Google OAuth refresh token for persistent GCP API access';



COMMENT ON COLUMN "public"."user_gcp_config"."gcp_access_token" IS 'Cached Google OAuth access token (expires after 1 hour)';



COMMENT ON COLUMN "public"."user_gcp_config"."gpu_auto_shutdown_minutes" IS 'Minutes of GPU API inactivity before auto-shutdown (10-600)';



COMMENT ON COLUMN "public"."user_gcp_config"."last_gpu_activity_at" IS 'Timestamp of last GPU API call for auto-shutdown tracking';



COMMENT ON COLUMN "public"."user_gcp_config"."youtube_oauth_client_id" IS 'Per-user OAuth Client ID from their own GCP project';



COMMENT ON COLUMN "public"."user_gcp_config"."youtube_oauth_client_secret" IS 'Per-user OAuth Client Secret from their own GCP project';



COMMENT ON COLUMN "public"."user_gcp_config"."youtube_refresh_token" IS 'YouTube refresh token obtained via per-user OAuth';



COMMENT ON COLUMN "public"."user_gcp_config"."youtube_oauth_verified" IS 'Whether the user has verified their OAuth setup';



CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text",
    "username" "text",
    "hashid" "text",
    "date_joined" timestamp with time zone DEFAULT "now"(),
    "account_tier" "text" DEFAULT 'starter'::"text",
    "gpu_hours_balance" integer DEFAULT 0 NOT NULL,
    "is_admin" boolean DEFAULT false,
    "onboarding_completed" boolean DEFAULT false,
    "joining_reason" "text"[],
    "status" "public"."account_status" DEFAULT 'pending'::"public"."account_status",
    "stripe_customer_id" "text",
    "discord_id" "text",
    "discord_username" "text",
    "discord_avatar" "text",
    "in_vidbolt_server" boolean DEFAULT false
);


ALTER TABLE "public"."users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."users"."discord_id" IS 'Discord user ID from OAuth identity';



COMMENT ON COLUMN "public"."users"."discord_username" IS 'Discord username (e.g. user#1234 or new-style username)';



COMMENT ON COLUMN "public"."users"."discord_avatar" IS 'Discord avatar hash for CDN URL construction';



COMMENT ON COLUMN "public"."users"."in_vidbolt_server" IS 'Whether user is in the VidBolt Discord server (checked at login)';



CREATE TABLE IF NOT EXISTS "public"."video_editor_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "s3_key" "text" NOT NULL,
    "s3_url" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "size" bigint NOT NULL,
    "duration" double precision,
    "thumbnail" "text",
    "width" integer,
    "height" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "video_editor_media_type_check" CHECK (("type" = ANY (ARRAY['video'::"text", 'image'::"text", 'audio'::"text"])))
);


ALTER TABLE "public"."video_editor_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_project_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "research_data" "jsonb" DEFAULT '{}'::"jsonb",
    "script_data" "jsonb" DEFAULT '{}'::"jsonb",
    "voice_data" "jsonb" DEFAULT '{}'::"jsonb",
    "timeline_data" "jsonb" DEFAULT '{}'::"jsonb",
    "export_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "editor_preferences" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."video_project_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."video_projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "project_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "current_stage" "text" DEFAULT 'idea'::"text" NOT NULL,
    "current_step" "text",
    "progress_percent" integer DEFAULT 0 NOT NULL,
    "script_task_id" "uuid",
    "audio_task_id" "uuid",
    "video_task_id" "uuid",
    "export_task_id" "uuid",
    "idea" "text",
    "script_content" "text",
    "audio_url" "text",
    "video_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "closed_loop_state" "jsonb",
    "worker_prompts" "jsonb",
    "creative_manifest" "jsonb",
    "cleanup_status" "text",
    "cleaned_at" timestamp with time zone,
    "thumbnail_url" "text",
    "youtube_channel_id" "uuid",
    CONSTRAINT "video_projects_current_stage_check" CHECK (("current_stage" = ANY (ARRAY['idea'::"text", 'outline'::"text", 'stock'::"text", 'script'::"text", 'production'::"text", 'audio'::"text", 'media'::"text", 'shot_planning'::"text", 'shot_creation'::"text", 'video'::"text", 'export'::"text", 'completed'::"text"]))),
    CONSTRAINT "video_projects_progress_percent_check" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100))),
    CONSTRAINT "video_projects_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."video_projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."video_projects" IS 'Individual video projects tracked through the production pipeline';



COMMENT ON COLUMN "public"."video_projects"."status" IS 'Overall video status: draft, processing, completed, failed, cancelled';



COMMENT ON COLUMN "public"."video_projects"."current_stage" IS '5-step workflow: idea → outline → script → production → video → export → completed';



COMMENT ON COLUMN "public"."video_projects"."metadata" IS 'Flexible JSONB storage for video-specific data. 
Media generation progress stored in metadata.media_generation: {
  status: "pending"|"av_script"|"images"|"image_edits"|"videos"|"completed"|"failed",
  started_at, completed_at, error,
  total_shots, current_shot_index, current_phase,
  images_completed, images_failed,
  edits_completed, edits_failed, edits_skipped,
  videos_completed, videos_failed
}';



COMMENT ON COLUMN "public"."video_projects"."closed_loop_state" IS 'Orchestrator state for crash recovery: phase, status, per-phase progress, flagged shots, errors';



COMMENT ON COLUMN "public"."video_projects"."worker_prompts" IS 'Per-worker system prompts generated by the Orchestrator for this video';



COMMENT ON COLUMN "public"."video_projects"."creative_manifest" IS 'User preferences + style rules merged from user profile and per-video overrides';



COMMENT ON COLUMN "public"."video_projects"."cleanup_status" IS 'Set to ''cleaned'' after data retention cleanup has processed this video';



COMMENT ON COLUMN "public"."video_projects"."cleaned_at" IS 'Timestamp when data retention cleanup was performed';



COMMENT ON COLUMN "public"."video_projects"."thumbnail_url" IS 'Preserved thumbnail URL for display after cleanup deletes all other media';



CREATE TABLE IF NOT EXISTS "public"."youtube_audience_demographics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "age_gender_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "country_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "device_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "traffic_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "os_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."youtube_audience_demographics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."youtube_channel_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "subscriber_count" bigint,
    "view_count" bigint,
    "video_count" integer,
    "estimated_revenue" numeric(12,2),
    "views_day" bigint,
    "subscribers_gained" integer,
    "subscribers_lost" integer,
    "estimated_minutes_watched" bigint,
    "average_view_duration" numeric(10,2),
    "likes" integer,
    "dislikes" integer,
    "comments" integer,
    "shares" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."youtube_channel_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."youtube_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_id" "text" NOT NULL,
    "channel_title" "text" NOT NULL,
    "channel_handle" "text",
    "thumbnail_url" "text",
    "subscriber_count" bigint DEFAULT 0,
    "view_count" bigint DEFAULT 0,
    "video_count" integer DEFAULT 0,
    "custom_url" "text",
    "is_primary" boolean DEFAULT false,
    "linked_at" timestamp with time zone DEFAULT "now"(),
    "last_synced_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "sync_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "connection_id" "uuid",
    CONSTRAINT "youtube_channels_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['pending'::"text", 'syncing'::"text", 'synced'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."youtube_channels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."youtube_video_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "video_id" "text" NOT NULL,
    "title" "text",
    "published_at" timestamp with time zone,
    "thumbnail_url" "text",
    "duration_seconds" integer,
    "views" bigint DEFAULT 0,
    "likes" integer DEFAULT 0,
    "comments" integer DEFAULT 0,
    "shares" integer DEFAULT 0,
    "estimated_minutes_watched" bigint DEFAULT 0,
    "average_view_duration" numeric(10,2),
    "estimated_revenue" numeric(10,2),
    "subscriber_impact" integer DEFAULT 0,
    "traffic_sources" "jsonb" DEFAULT '{}'::"jsonb",
    "demographics" "jsonb" DEFAULT '{}'::"jsonb",
    "geography" "jsonb" DEFAULT '{}'::"jsonb",
    "devices" "jsonb" DEFAULT '{}'::"jsonb",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."youtube_video_analytics" OWNER TO "postgres";


ALTER TABLE ONLY "public"."analytics_sync_log"
    ADD CONSTRAINT "analytics_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banned_identities"
    ADD CONSTRAINT "banned_identities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitor_channel_snapshots"
    ADD CONSTRAINT "competitor_channel_snapshots_competitor_id_snapshot_date_key" UNIQUE ("competitor_id", "snapshot_date");



ALTER TABLE ONLY "public"."competitor_channel_snapshots"
    ADD CONSTRAINT "competitor_channel_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitor_channels"
    ADD CONSTRAINT "competitor_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."competitor_channels"
    ADD CONSTRAINT "competitor_channels_user_id_channel_id_key" UNIQUE ("user_id", "channel_id");



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_task_id_key" UNIQUE ("task_id");



ALTER TABLE ONLY "public"."gpu_hours_transactions"
    ADD CONSTRAINT "gpu_hours_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."media_projects"
    ADD CONSTRAINT "media_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_statements"
    ADD CONSTRAINT "monthly_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_statements"
    ADD CONSTRAINT "monthly_statements_user_id_month_date_key" UNIQUE ("user_id", "month_date");



ALTER TABLE ONLY "public"."niche_network_channels"
    ADD CONSTRAINT "niche_network_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."niche_network_channels"
    ADD CONSTRAINT "niche_network_channels_user_id_channel_id_key" UNIQUE ("user_id", "channel_id");



ALTER TABLE ONLY "public"."niche_network_edges"
    ADD CONSTRAINT "niche_network_edges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."niche_network_edges"
    ADD CONSTRAINT "niche_network_edges_user_id_source_channel_target_channel_key" UNIQUE ("user_id", "source_channel", "target_channel");



ALTER TABLE ONLY "public"."pending_gpu_jobs"
    ADD CONSTRAINT "pending_gpu_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_analytics_daily"
    ADD CONSTRAINT "platform_analytics_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_analytics_daily"
    ADD CONSTRAINT "platform_analytics_daily_snapshot_date_key" UNIQUE ("snapshot_date");



ALTER TABLE ONLY "public"."project_entities"
    ADD CONSTRAINT "project_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_settings"
    ADD CONSTRAINT "project_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_settings"
    ADD CONSTRAINT "project_settings_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."render_jobs"
    ADD CONSTRAINT "render_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."social_connections"
    ADD CONSTRAINT "social_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_media"
    ADD CONSTRAINT "stock_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_steps"
    ADD CONSTRAINT "task_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_gcp_config"
    ADD CONSTRAINT "user_gcp_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_gcp_config"
    ADD CONSTRAINT "user_gcp_config_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_hashid_key" UNIQUE ("hashid");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."video_editor_media"
    ADD CONSTRAINT "video_editor_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_project_state"
    ADD CONSTRAINT "video_project_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."video_project_state"
    ADD CONSTRAINT "video_project_state_project_id_key" UNIQUE ("project_id");



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."youtube_audience_demographics"
    ADD CONSTRAINT "youtube_audience_demographics_channel_id_snapshot_date_key" UNIQUE ("channel_id", "snapshot_date");



ALTER TABLE ONLY "public"."youtube_audience_demographics"
    ADD CONSTRAINT "youtube_audience_demographics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."youtube_channel_snapshots"
    ADD CONSTRAINT "youtube_channel_snapshots_channel_id_snapshot_date_key" UNIQUE ("channel_id", "snapshot_date");



ALTER TABLE ONLY "public"."youtube_channel_snapshots"
    ADD CONSTRAINT "youtube_channel_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."youtube_channels"
    ADD CONSTRAINT "youtube_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."youtube_channels"
    ADD CONSTRAINT "youtube_channels_user_id_channel_id_key" UNIQUE ("user_id", "channel_id");



ALTER TABLE ONLY "public"."youtube_video_analytics"
    ADD CONSTRAINT "youtube_video_analytics_channel_id_video_id_key" UNIQUE ("channel_id", "video_id");



ALTER TABLE ONLY "public"."youtube_video_analytics"
    ADD CONSTRAINT "youtube_video_analytics_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_audience_demo_channel_date" ON "public"."youtube_audience_demographics" USING "btree" ("channel_id", "snapshot_date" DESC);



CREATE INDEX "idx_banned_identities_discord_id" ON "public"."banned_identities" USING "btree" ("discord_id");



CREATE INDEX "idx_banned_identities_email" ON "public"."banned_identities" USING "btree" ("email");



CREATE INDEX "idx_channel_snapshots_date" ON "public"."youtube_channel_snapshots" USING "btree" ("channel_id", "snapshot_date" DESC);



CREATE INDEX "idx_competitor_channels_user" ON "public"."competitor_channels" USING "btree" ("user_id");



CREATE INDEX "idx_competitor_snapshots_date" ON "public"."competitor_channel_snapshots" USING "btree" ("competitor_id", "snapshot_date" DESC);



CREATE INDEX "idx_gpu_hours_transactions_stripe_session" ON "public"."gpu_hours_transactions" USING "btree" ("stripe_session_id") WHERE ("stripe_session_id" IS NOT NULL);



CREATE INDEX "idx_gpu_hours_transactions_user_id" ON "public"."gpu_hours_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_media_projects_user_id" ON "public"."media_projects" USING "btree" ("user_id");



CREATE INDEX "idx_monthly_statements_user_date" ON "public"."monthly_statements" USING "btree" ("user_id", "month_date");



CREATE INDEX "idx_niche_edges_user" ON "public"."niche_network_edges" USING "btree" ("user_id");



CREATE INDEX "idx_niche_network_emerging" ON "public"."niche_network_channels" USING "btree" ("user_id", "is_emerging") WHERE ("is_emerging" = true);



CREATE INDEX "idx_niche_network_similarity" ON "public"."niche_network_channels" USING "btree" ("user_id", "similarity_score" DESC);



CREATE INDEX "idx_niche_network_user" ON "public"."niche_network_channels" USING "btree" ("user_id");



CREATE INDEX "idx_pending_gpu_jobs_expires" ON "public"."pending_gpu_jobs" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_pending_gpu_jobs_user_status" ON "public"."pending_gpu_jobs" USING "btree" ("user_id", "status");



CREATE INDEX "idx_platform_daily_date" ON "public"."platform_analytics_daily" USING "btree" ("snapshot_date" DESC);



CREATE INDEX "idx_project_entities_project_id" ON "public"."project_entities" USING "btree" ("project_id");



CREATE INDEX "idx_render_jobs_created_at" ON "public"."render_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_render_jobs_status" ON "public"."render_jobs" USING "btree" ("status");



CREATE INDEX "idx_render_jobs_user_id" ON "public"."render_jobs" USING "btree" ("user_id");



CREATE INDEX "idx_render_jobs_video_id" ON "public"."render_jobs" USING "btree" ("video_id");



CREATE INDEX "idx_social_connections_provider" ON "public"."social_connections" USING "btree" ("user_id", "provider");



CREATE INDEX "idx_social_connections_user" ON "public"."social_connections" USING "btree" ("user_id");



CREATE INDEX "idx_stock_media_user_id" ON "public"."stock_media" USING "btree" ("user_id");



CREATE INDEX "idx_stock_media_user_video" ON "public"."stock_media" USING "btree" ("user_id", "video_id");



CREATE INDEX "idx_stock_media_video_entity" ON "public"."stock_media" USING "btree" ("video_id", "entity_name") WHERE ("entity_name" IS NOT NULL);



CREATE INDEX "idx_stock_media_video_id" ON "public"."stock_media" USING "btree" ("video_id");



CREATE INDEX "idx_sync_log_user" ON "public"."analytics_sync_log" USING "btree" ("user_id", "started_at" DESC);



CREATE INDEX "idx_task_steps_status" ON "public"."task_steps" USING "btree" ("status");



CREATE INDEX "idx_task_steps_task_id" ON "public"."task_steps" USING "btree" ("task_id");



CREATE INDEX "idx_tasks_created_at" ON "public"."tasks" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tasks_has_final_script" ON "public"."tasks" USING "btree" ("user_id") WHERE ("final_script" IS NOT NULL);



CREATE INDEX "idx_tasks_input_data" ON "public"."tasks" USING "gin" ("input_data" "jsonb_path_ops");



CREATE INDEX "idx_tasks_output_data" ON "public"."tasks" USING "gin" ("output_data" "jsonb_path_ops");



CREATE INDEX "idx_tasks_project_id" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_tasks_status" ON "public"."tasks" USING "btree" ("status");



CREATE INDEX "idx_tasks_steps" ON "public"."tasks" USING "gin" ("steps" "jsonb_path_ops");



CREATE INDEX "idx_tasks_user_id" ON "public"."tasks" USING "btree" ("user_id");



CREATE INDEX "idx_tasks_user_status" ON "public"."tasks" USING "btree" ("user_id", "status");



CREATE INDEX "idx_tasks_user_type" ON "public"."tasks" USING "btree" ("user_id", "type");



CREATE INDEX "idx_users_discord_id" ON "public"."users" USING "btree" ("discord_id");



CREATE INDEX "idx_video_analytics_channel" ON "public"."youtube_video_analytics" USING "btree" ("channel_id");



CREATE INDEX "idx_video_analytics_published" ON "public"."youtube_video_analytics" USING "btree" ("published_at" DESC);



CREATE INDEX "idx_video_analytics_views" ON "public"."youtube_video_analytics" USING "btree" ("views" DESC);



CREATE INDEX "idx_video_editor_media_project" ON "public"."video_editor_media" USING "btree" ("project_id");



CREATE INDEX "idx_video_editor_media_user" ON "public"."video_editor_media" USING "btree" ("user_id");



CREATE INDEX "idx_video_editor_media_user_project" ON "public"."video_editor_media" USING "btree" ("user_id", "project_id");



CREATE INDEX "idx_video_editor_media_user_project_date" ON "public"."video_editor_media" USING "btree" ("user_id", "project_id", "created_at" DESC);



CREATE INDEX "idx_video_project_state_project" ON "public"."video_project_state" USING "btree" ("project_id");



CREATE INDEX "idx_video_projects_cleanup" ON "public"."video_projects" USING "btree" ("created_at") WHERE (("cleanup_status" IS NULL) AND ("status" = ANY (ARRAY['completed'::"text", 'failed'::"text", 'cancelled'::"text"])));



CREATE INDEX "idx_video_projects_created_at" ON "public"."video_projects" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_video_projects_current_stage" ON "public"."video_projects" USING "btree" ("current_stage");



CREATE INDEX "idx_video_projects_metadata" ON "public"."video_projects" USING "gin" ("metadata" "jsonb_path_ops");



CREATE INDEX "idx_video_projects_project_id" ON "public"."video_projects" USING "btree" ("project_id");



CREATE INDEX "idx_video_projects_status" ON "public"."video_projects" USING "btree" ("status");



CREATE INDEX "idx_video_projects_user_id" ON "public"."video_projects" USING "btree" ("user_id");



CREATE INDEX "idx_video_projects_user_status" ON "public"."video_projects" USING "btree" ("user_id", "status");



CREATE INDEX "idx_youtube_channels_channel_id" ON "public"."youtube_channels" USING "btree" ("channel_id");



CREATE INDEX "idx_youtube_channels_user_id" ON "public"."youtube_channels" USING "btree" ("user_id");



CREATE INDEX "stock_media_embedding_idx" ON "public"."stock_media" USING "ivfflat" ("embedding" "extensions"."vector_cosine_ops") WITH ("lists"='100');



CREATE OR REPLACE TRIGGER "auto_approve_admin_trigger" BEFORE INSERT OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."auto_approve_admin"();



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."user_gcp_config" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "protect_monthly_statements_sensitive_columns_trigger" BEFORE UPDATE ON "public"."monthly_statements" FOR EACH ROW EXECUTE FUNCTION "public"."protect_monthly_statements_sensitive_columns"();



CREATE OR REPLACE TRIGGER "protect_tasks_sensitive_columns_trigger" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."protect_tasks_sensitive_columns"();



CREATE OR REPLACE TRIGGER "protect_user_gcp_config_sensitive_columns_trigger" BEFORE UPDATE ON "public"."user_gcp_config" FOR EACH ROW EXECUTE FUNCTION "public"."protect_user_gcp_config_sensitive_columns"();



CREATE OR REPLACE TRIGGER "protect_users_sensitive_columns_trigger" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."protect_users_sensitive_columns"();



CREATE OR REPLACE TRIGGER "protect_video_projects_sensitive_columns_trigger" BEFORE UPDATE ON "public"."video_projects" FOR EACH ROW EXECUTE FUNCTION "public"."protect_video_projects_sensitive_columns"();



CREATE OR REPLACE TRIGGER "set_paid_at_trigger" BEFORE INSERT OR UPDATE ON "public"."monthly_statements" FOR EACH ROW EXECUTE FUNCTION "public"."handle_payment_status_change"();



CREATE OR REPLACE TRIGGER "set_updated_at_continuity_state" BEFORE UPDATE ON "public"."continuity_state" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_media_projects" BEFORE UPDATE ON "public"."media_projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_project_settings" BEFORE UPDATE ON "public"."project_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_tasks" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_user_settings" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_video_projects" BEFORE UPDATE ON "public"."video_projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_render_jobs_updated_at" BEFORE UPDATE ON "public"."render_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_render_jobs_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_api_keys_updated_at" BEFORE UPDATE ON "public"."user_api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "video_project_state_updated_at" BEFORE UPDATE ON "public"."video_project_state" FOR EACH ROW EXECUTE FUNCTION "public"."update_video_project_state_updated_at"();



ALTER TABLE ONLY "public"."analytics_sync_log"
    ADD CONSTRAINT "analytics_sync_log_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."analytics_sync_log"
    ADD CONSTRAINT "analytics_sync_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."banned_identities"
    ADD CONSTRAINT "banned_identities_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."competitor_channel_snapshots"
    ADD CONSTRAINT "competitor_channel_snapshots_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitor_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."competitor_channels"
    ADD CONSTRAINT "competitor_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gpu_hours_transactions"
    ADD CONSTRAINT "gpu_hours_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_projects"
    ADD CONSTRAINT "media_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_statements"
    ADD CONSTRAINT "monthly_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."niche_network_channels"
    ADD CONSTRAINT "niche_network_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."niche_network_edges"
    ADD CONSTRAINT "niche_network_edges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_gpu_jobs"
    ADD CONSTRAINT "pending_gpu_jobs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pending_gpu_jobs"
    ADD CONSTRAINT "pending_gpu_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_gpu_jobs"
    ADD CONSTRAINT "pending_gpu_jobs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "public"."video_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_entities"
    ADD CONSTRAINT "project_entities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_settings"
    ADD CONSTRAINT "project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."media_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."render_jobs"
    ADD CONSTRAINT "render_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."social_connections"
    ADD CONSTRAINT "social_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_steps"
    ADD CONSTRAINT "task_steps_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."media_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_api_keys"
    ADD CONSTRAINT "user_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_gcp_config"
    ADD CONSTRAINT "user_gcp_config_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_editor_media"
    ADD CONSTRAINT "video_editor_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_editor_media"
    ADD CONSTRAINT "video_editor_media_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_project_state"
    ADD CONSTRAINT "video_project_state_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."video_projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_audio_task_id_fkey" FOREIGN KEY ("audio_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_export_task_id_fkey" FOREIGN KEY ("export_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."media_projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_script_task_id_fkey" FOREIGN KEY ("script_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_video_task_id_fkey" FOREIGN KEY ("video_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_youtube_channel_id_fkey" FOREIGN KEY ("youtube_channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."youtube_audience_demographics"
    ADD CONSTRAINT "youtube_audience_demographics_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."youtube_channel_snapshots"
    ADD CONSTRAINT "youtube_channel_snapshots_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."youtube_channels"
    ADD CONSTRAINT "youtube_channels_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "public"."social_connections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."youtube_channels"
    ADD CONSTRAINT "youtube_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."youtube_video_analytics"
    ADD CONSTRAINT "youtube_video_analytics_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."youtube_channels"("id") ON DELETE CASCADE;



CREATE POLICY "Admins view platform analytics" ON "public"."platform_analytics_daily" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "Authenticated users can view stock media" ON "public"."stock_media" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Service role can manage stock media" ON "public"."stock_media" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access on banned_identities" ON "public"."banned_identities" USING (("public"."get_request_role"() = 'service_role'::"text")) WITH CHECK (("public"."get_request_role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on gpu_hours_transactions" ON "public"."gpu_hours_transactions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on video_editor_media" ON "public"."video_editor_media" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access on video_project_state" ON "public"."video_project_state" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to project_entities" ON "public"."project_entities" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to render jobs" ON "public"."render_jobs" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "System insert channel snapshots" ON "public"."youtube_channel_snapshots" FOR INSERT WITH CHECK ((("channel_id" IN ( SELECT "youtube_channels"."id"
   FROM "public"."youtube_channels"
  WHERE ("youtube_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "System insert competitor snapshots" ON "public"."competitor_channel_snapshots" FOR INSERT WITH CHECK ((("competitor_id" IN ( SELECT "competitor_channels"."id"
   FROM "public"."competitor_channels"
  WHERE ("competitor_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "System insert demographics" ON "public"."youtube_audience_demographics" FOR INSERT WITH CHECK ((("channel_id" IN ( SELECT "youtube_channels"."id"
   FROM "public"."youtube_channels"
  WHERE ("youtube_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "System insert platform analytics" ON "public"."platform_analytics_daily" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true)))));



CREATE POLICY "System insert sync logs" ON "public"."analytics_sync_log" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "System manage video analytics" ON "public"."youtube_video_analytics" USING ((("channel_id" IN ( SELECT "youtube_channels"."id"
   FROM "public"."youtube_channels"
  WHERE ("youtube_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users can delete own project entities" ON "public"."project_entities" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."video_projects" "vp"
  WHERE (("vp"."id" = "project_entities"."project_id") AND ("vp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete state for their own projects" ON "public"."video_project_state" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."video_projects"
  WHERE (("video_projects"."id" = "video_project_state"."project_id") AND ("video_projects"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own config" ON "public"."user_gcp_config" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own media" ON "public"."video_editor_media" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own video projects" ON "public"."video_projects" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own keys" ON "public"."user_api_keys" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can insert own project entities" ON "public"."project_entities" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."video_projects" "vp"
  WHERE (("vp"."id" = "project_entities"."project_id") AND ("vp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert state for their own projects" ON "public"."video_project_state" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."video_projects"
  WHERE (("video_projects"."id" = "video_project_state"."project_id") AND ("video_projects"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own config" ON "public"."user_gcp_config" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own media" ON "public"."video_editor_media" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own statements" ON "public"."monthly_statements" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own video projects" ON "public"."video_projects" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage settings for their owned projects" ON "public"."project_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."media_projects"
  WHERE (("media_projects"."id" = "project_settings"."project_id") AND ("media_projects"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."media_projects"
  WHERE (("media_projects"."id" = "project_settings"."project_id") AND ("media_projects"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can manage their own continuity state" ON "public"."continuity_state" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "continuity_state"."task_id") AND ("tasks"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "continuity_state"."task_id") AND ("tasks"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can manage their own general settings" ON "public"."user_settings" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage their own media projects" ON "public"."media_projects" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage their own tasks" ON "public"."tasks" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can read own project entities" ON "public"."project_entities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."video_projects" "vp"
  WHERE (("vp"."id" = "project_entities"."project_id") AND ("vp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own keys" ON "public"."user_api_keys" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can update own project entities" ON "public"."project_entities" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."video_projects" "vp"
  WHERE (("vp"."id" = "project_entities"."project_id") AND ("vp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update state for their own projects" ON "public"."video_project_state" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."video_projects"
  WHERE (("video_projects"."id" = "video_project_state"."project_id") AND ("video_projects"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own config" ON "public"."user_gcp_config" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own statements" ON "public"."monthly_statements" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own video projects" ON "public"."video_projects" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own keys" ON "public"."user_api_keys" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "Users can view own render jobs" ON "public"."render_jobs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own transactions" ON "public"."gpu_hours_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view state for their own projects" ON "public"."video_project_state" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."video_projects"
  WHERE (("video_projects"."id" = "video_project_state"."project_id") AND ("video_projects"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view steps for their own tasks" ON "public"."task_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "task_steps"."task_id") AND ("tasks"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Users can view their own config" ON "public"."user_gcp_config" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own media" ON "public"."video_editor_media" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own statements" ON "public"."monthly_statements" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own video projects" ON "public"."video_projects" FOR SELECT USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR (("project_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."media_projects"
  WHERE (("media_projects"."id" = "video_projects"."project_id") AND ("media_projects"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "Users manage own channels" ON "public"."youtube_channels" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users manage own competitors" ON "public"."competitor_channels" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users manage own connections" ON "public"."social_connections" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users manage own niche edges" ON "public"."niche_network_edges" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users manage own niche network" ON "public"."niche_network_channels" USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users manage own pending jobs" ON "public"."pending_gpu_jobs" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users view own channel snapshots" ON "public"."youtube_channel_snapshots" FOR SELECT USING ((("channel_id" IN ( SELECT "youtube_channels"."id"
   FROM "public"."youtube_channels"
  WHERE ("youtube_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users view own competitor snapshots" ON "public"."competitor_channel_snapshots" FOR SELECT USING ((("competitor_id" IN ( SELECT "competitor_channels"."id"
   FROM "public"."competitor_channels"
  WHERE ("competitor_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users view own demographics" ON "public"."youtube_audience_demographics" FOR SELECT USING ((("channel_id" IN ( SELECT "youtube_channels"."id"
   FROM "public"."youtube_channels"
  WHERE ("youtube_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users view own sync logs" ON "public"."analytics_sync_log" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



CREATE POLICY "Users view own video analytics" ON "public"."youtube_video_analytics" FOR SELECT USING ((("channel_id" IN ( SELECT "youtube_channels"."id"
   FROM "public"."youtube_channels"
  WHERE ("youtube_channels"."user_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."is_admin" = true))))));



ALTER TABLE "public"."analytics_sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."banned_identities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitor_channel_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."competitor_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."continuity_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gpu_hours_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."niche_network_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."niche_network_edges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_gpu_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_analytics_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."render_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."social_connections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_gcp_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_editor_media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_project_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."youtube_audience_demographics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."youtube_channel_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."youtube_channels" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."youtube_video_analytics" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."video_projects";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


















































































































































































































































































































































































































































































































GRANT ALL ON FUNCTION "public"."admin_ban_user"("target_user_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_ban_user"("target_user_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_ban_user"("target_user_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_user_for_deletion"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_user_for_deletion"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_user_for_deletion"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_unban_identity"("p_banned_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_unban_identity"("p_banned_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_unban_identity"("p_banned_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_wipe_user_data"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_wipe_user_data"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_wipe_user_data"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_approve_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_approve_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_approve_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_banned_identity"("p_email" "text", "p_discord_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_banned_identity"("p_email" "text", "p_discord_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_banned_identity"("p_email" "text", "p_discord_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."credit_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_stripe_session_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."credit_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_stripe_session_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."credit_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_stripe_session_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."deduct_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_video_id" "uuid", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."deduct_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_video_id" "uuid", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deduct_gpu_hours"("p_user_id" "uuid", "p_hours" integer, "p_video_id" "uuid", "p_description" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_analytics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_banned_identities"("page" integer, "per_page" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_banned_identities"("page" integer, "per_page" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_banned_identities"("page" integer, "per_page" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_request_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_request_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_request_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_stock_media_by_entity"("p_video_id" "uuid", "p_entity_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stock_media_by_entity"("p_video_id" "uuid", "p_entity_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stock_media_by_entity"("p_video_id" "uuid", "p_entity_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."monthly_statements" TO "anon";
GRANT ALL ON TABLE "public"."monthly_statements" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_statements" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_payment_history"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_payment_history"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_payment_history"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_users_paginated"("page" integer, "per_page" integer, "search_text" "text", "status_filter" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_users_paginated"("page" integer, "per_page" integer, "search_text" "text", "status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_users_paginated"("page" integer, "per_page" integer, "search_text" "text", "status_filter" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_payment_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_payment_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_payment_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."link_task_to_video"("p_video_id" "uuid", "p_task_id" "uuid", "p_task_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."link_task_to_video"("p_video_id" "uuid", "p_task_id" "uuid", "p_task_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_task_to_video"("p_video_id" "uuid", "p_task_id" "uuid", "p_task_type" "text") TO "service_role";









GRANT ALL ON FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_video_metadata"("p_video_id" "uuid", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_video_metadata"("p_video_id" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_video_metadata"("p_video_id" "uuid", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_monthly_statements_sensitive_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_monthly_statements_sensitive_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_monthly_statements_sensitive_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_tasks_sensitive_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_tasks_sensitive_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_tasks_sensitive_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_user_gcp_config_sensitive_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_user_gcp_config_sensitive_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_user_gcp_config_sensitive_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_users_sensitive_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_users_sensitive_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_users_sensitive_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_video_projects_sensitive_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_video_projects_sensitive_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_video_projects_sensitive_columns"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_render_jobs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_render_jobs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_render_jobs_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_status"("target_user_id" "uuid", "new_status" "public"."account_status") TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_status"("target_user_id" "uuid", "new_status" "public"."account_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_status"("target_user_id" "uuid", "new_status" "public"."account_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_video_progress"("p_video_id" "uuid", "p_current_stage" "text", "p_current_step" "text", "p_progress_percent" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_video_progress"("p_video_id" "uuid", "p_current_stage" "text", "p_current_step" "text", "p_progress_percent" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_video_progress"("p_video_id" "uuid", "p_current_stage" "text", "p_current_step" "text", "p_progress_percent" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_video_project_state_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_video_project_state_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_video_project_state_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "text", "proof_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "text", "proof_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "text", "proof_url" "text") TO "service_role";






























GRANT ALL ON TABLE "public"."analytics_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."analytics_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."banned_identities" TO "anon";
GRANT ALL ON TABLE "public"."banned_identities" TO "authenticated";
GRANT ALL ON TABLE "public"."banned_identities" TO "service_role";



GRANT ALL ON TABLE "public"."competitor_channel_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."competitor_channel_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."competitor_channel_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."competitor_channels" TO "anon";
GRANT ALL ON TABLE "public"."competitor_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."competitor_channels" TO "service_role";



GRANT ALL ON TABLE "public"."continuity_state" TO "anon";
GRANT ALL ON TABLE "public"."continuity_state" TO "authenticated";
GRANT ALL ON TABLE "public"."continuity_state" TO "service_role";



GRANT ALL ON TABLE "public"."gpu_hours_transactions" TO "anon";
GRANT ALL ON TABLE "public"."gpu_hours_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."gpu_hours_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."media_projects" TO "anon";
GRANT ALL ON TABLE "public"."media_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."media_projects" TO "service_role";



GRANT ALL ON TABLE "public"."niche_network_channels" TO "anon";
GRANT ALL ON TABLE "public"."niche_network_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."niche_network_channels" TO "service_role";



GRANT ALL ON TABLE "public"."niche_network_edges" TO "anon";
GRANT ALL ON TABLE "public"."niche_network_edges" TO "authenticated";
GRANT ALL ON TABLE "public"."niche_network_edges" TO "service_role";



GRANT ALL ON TABLE "public"."pending_gpu_jobs" TO "anon";
GRANT ALL ON TABLE "public"."pending_gpu_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_gpu_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."platform_analytics_daily" TO "anon";
GRANT ALL ON TABLE "public"."platform_analytics_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_analytics_daily" TO "service_role";



GRANT ALL ON TABLE "public"."project_entities" TO "anon";
GRANT ALL ON TABLE "public"."project_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."project_entities" TO "service_role";



GRANT ALL ON TABLE "public"."project_settings" TO "anon";
GRANT ALL ON TABLE "public"."project_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_settings" TO "service_role";



GRANT ALL ON TABLE "public"."render_jobs" TO "anon";
GRANT ALL ON TABLE "public"."render_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."render_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."social_connections" TO "anon";
GRANT ALL ON TABLE "public"."social_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."social_connections" TO "service_role";



GRANT ALL ON TABLE "public"."stock_media" TO "anon";
GRANT ALL ON TABLE "public"."stock_media" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_media" TO "service_role";



GRANT ALL ON TABLE "public"."task_steps" TO "anon";
GRANT ALL ON TABLE "public"."task_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."task_steps" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_api_keys" TO "anon";
GRANT ALL ON TABLE "public"."user_api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_api_keys" TO "service_role";



GRANT ALL ON TABLE "public"."user_gcp_config" TO "anon";
GRANT ALL ON TABLE "public"."user_gcp_config" TO "authenticated";
GRANT ALL ON TABLE "public"."user_gcp_config" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."video_editor_media" TO "anon";
GRANT ALL ON TABLE "public"."video_editor_media" TO "authenticated";
GRANT ALL ON TABLE "public"."video_editor_media" TO "service_role";



GRANT ALL ON TABLE "public"."video_project_state" TO "anon";
GRANT ALL ON TABLE "public"."video_project_state" TO "authenticated";
GRANT ALL ON TABLE "public"."video_project_state" TO "service_role";



GRANT ALL ON TABLE "public"."video_projects" TO "anon";
GRANT ALL ON TABLE "public"."video_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."video_projects" TO "service_role";



GRANT ALL ON TABLE "public"."youtube_audience_demographics" TO "anon";
GRANT ALL ON TABLE "public"."youtube_audience_demographics" TO "authenticated";
GRANT ALL ON TABLE "public"."youtube_audience_demographics" TO "service_role";



GRANT ALL ON TABLE "public"."youtube_channel_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."youtube_channel_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."youtube_channel_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."youtube_channels" TO "anon";
GRANT ALL ON TABLE "public"."youtube_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."youtube_channels" TO "service_role";



GRANT ALL ON TABLE "public"."youtube_video_analytics" TO "anon";
GRANT ALL ON TABLE "public"."youtube_video_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."youtube_video_analytics" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































