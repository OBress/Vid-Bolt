


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


CREATE OR REPLACE FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."get_admin_analytics"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    total_users int;
    active_users int;
    pending_users int;
    total_projects int;
    result jsonb;
BEGIN
    -- Check if requester is admin using alias 'u'
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


CREATE OR REPLACE FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "status" "text", "current_stage" "text", "current_step" "text", "progress_percent" integer, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
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
    AS $$
BEGIN
    -- Check if requester is admin
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


CREATE OR REPLACE FUNCTION "public"."get_users_paginated"("page" integer DEFAULT 1, "per_page" integer DEFAULT 20, "search_text" "text" DEFAULT ''::"text", "status_filter" "text" DEFAULT 'all'::"text") RETURNS TABLE("id" "uuid", "email" "text", "name" "text", "username" "text", "is_admin" boolean, "status" "public"."account_status", "date_joined" timestamp with time zone, "total_count" bigint, "last_month_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    -- No longer just a single string, we search a range
BEGIN
    -- Check for admin
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
                -- Fetch the most recent statement status from the last 2 months (Current or Previous)
                -- If they paid for this month OR last month, we count it.
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


ALTER FUNCTION "public"."get_users_paginated"("page" integer, "per_page" integer, "search_text" "text", "status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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
    AS $$
BEGIN
    -- If status is changing to 'paid', set paid_at to now()
    IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
        NEW.paid_at = now();
    -- If status is changing FROM 'paid' to something else (e.g. reset), clear paid_at
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        NEW.paid_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_payment_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_task_to_video"("p_video_id" "uuid", "p_task_id" "uuid", "p_task_type" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."protect_admin_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if is_admin is being changed
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- 1. Allow service_role (used by backend/workers)
    IF (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
      RETURN NEW;
    END IF;

    -- 2. Allow postgres role (used by Supabase Dashboard / SQL Editor)
    -- This allows the owner to change status from the Web UI
    IF (session_user = 'postgres') THEN
      RETURN NEW;
    END IF;

    -- If neither, block the update
    RAISE EXCEPTION 'You are not authorized to change the is_admin status. This action is restricted to the Supabase Dashboard or Service Role.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."protect_admin_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Check if requester is admin (aliased)
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.monthly_statements
    SET 
        status = 'draft',
        payment_proof_url = NULL,
        updated_at = now()
    WHERE user_id = target_user_id 
      AND month_date = target_month_date::date; -- Explicit cast to date
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Statement not found for user % and month %', target_user_id, target_month_date;
    END IF;
END;
$$;


ALTER FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  updated_steps JSONB;
BEGIN
  -- Build updated steps array
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
  
  -- Update the task
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
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_status"("target_user_id" "uuid", "new_status" "public"."account_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Check if requester is admin using alias 'u'
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Prevent modifying own status to non-active (anti-lockout)
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
    AS $$
BEGIN
    UPDATE public.video_projects
    SET 
        current_stage = p_current_stage,
        current_step = p_current_step,
        progress_percent = p_progress_percent,
        updated_at = now(),
        -- Auto-set status to processing if not already completed/failed
        status = CASE 
            WHEN status = 'draft' THEN 'processing'
            WHEN status IN ('completed', 'failed', 'cancelled') THEN status
            ELSE 'processing'
        END,
        -- Auto-set completed_at when stage is 'completed'
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


CREATE OR REPLACE FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "date") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Check for admin
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    UPDATE public.monthly_statements
    SET 
        status = 'paid',
        updated_at = now()
        -- paid_at trigger will handle the timestamp
    WHERE user_id = target_user_id 
      AND month_date = target_month_date;
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Statement not found';
    END IF;
END;
$$;


ALTER FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "date") OWNER TO "postgres";


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


CREATE TABLE IF NOT EXISTS "public"."media_projects" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "picture_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."media_projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_settings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{"voice": {}, "export": {}, "editing": {}, "visuals": {}, "basic_info": {}}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_settings" OWNER TO "postgres";


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
    "inngest_run_id" "text",
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
    CONSTRAINT "tasks_current_phase_check" CHECK ((("current_phase" IS NULL) OR ("current_phase" = ANY (ARRAY['preprocessing'::"text", 'writing'::"text", 'postprocessing'::"text", 'audio_generation'::"text", 'audio_processing'::"text", 'image_generation'::"text", 'image_editing'::"text", 'video_generation'::"text", 'compositing'::"text", 'encoding'::"text", 'uploading'::"text"])))),
    CONSTRAINT "tasks_progress_percent_check" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100))),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tasks_type_check" CHECK (("type" = ANY (ARRAY['writing'::"text", 'writing_workflow'::"text", 'audio'::"text", 'video'::"text", 'export'::"text"])))
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
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_api_keys" OWNER TO "postgres";


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
    "last_seen_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_gcp_config" OWNER TO "postgres";


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
    "credits" integer DEFAULT 0,
    "is_admin" boolean DEFAULT false,
    "onboarding_completed" boolean DEFAULT false,
    "joining_reason" "text"[],
    "status" "public"."account_status" DEFAULT 'pending'::"public"."account_status"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


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
    CONSTRAINT "video_projects_current_stage_check" CHECK (("current_stage" = ANY (ARRAY['idea'::"text", 'script'::"text", 'audio'::"text", 'media'::"text", 'video'::"text", 'export'::"text", 'completed'::"text"]))),
    CONSTRAINT "video_projects_progress_percent_check" CHECK ((("progress_percent" >= 0) AND ("progress_percent" <= 100))),
    CONSTRAINT "video_projects_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."video_projects" OWNER TO "postgres";


COMMENT ON TABLE "public"."video_projects" IS 'Individual video projects tracked through the production pipeline';



COMMENT ON COLUMN "public"."video_projects"."status" IS 'Overall video status: draft, processing, completed, failed, cancelled';



COMMENT ON COLUMN "public"."video_projects"."current_stage" IS 'Current pipeline stage: idea, script, audio, video, export, completed';



COMMENT ON COLUMN "public"."video_projects"."metadata" IS 'Flexible JSONB storage for video-specific data. 
Media generation progress stored in metadata.media_generation: {
  status: "pending"|"av_script"|"images"|"image_edits"|"videos"|"completed"|"failed",
  started_at, completed_at, error,
  total_shots, current_shot_index, current_phase,
  images_completed, images_failed,
  edits_completed, edits_failed, edits_skipped,
  videos_completed, videos_failed
}';



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_task_id_key" UNIQUE ("task_id");



ALTER TABLE ONLY "public"."media_projects"
    ADD CONSTRAINT "media_projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_statements"
    ADD CONSTRAINT "monthly_statements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_statements"
    ADD CONSTRAINT "monthly_statements_user_id_month_date_key" UNIQUE ("user_id", "month_date");



ALTER TABLE ONLY "public"."project_settings"
    ADD CONSTRAINT "project_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_settings"
    ADD CONSTRAINT "project_settings_project_id_key" UNIQUE ("project_id");



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



ALTER TABLE ONLY "public"."video_projects"
    ADD CONSTRAINT "video_projects_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_monthly_statements_user_date" ON "public"."monthly_statements" USING "btree" ("user_id", "month_date");



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



CREATE INDEX "idx_video_projects_created_at" ON "public"."video_projects" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_video_projects_current_stage" ON "public"."video_projects" USING "btree" ("current_stage");



CREATE INDEX "idx_video_projects_metadata" ON "public"."video_projects" USING "gin" ("metadata" "jsonb_path_ops");



CREATE INDEX "idx_video_projects_project_id" ON "public"."video_projects" USING "btree" ("project_id");



CREATE INDEX "idx_video_projects_status" ON "public"."video_projects" USING "btree" ("status");



CREATE INDEX "idx_video_projects_user_id" ON "public"."video_projects" USING "btree" ("user_id");



CREATE INDEX "idx_video_projects_user_status" ON "public"."video_projects" USING "btree" ("user_id", "status");



CREATE OR REPLACE TRIGGER "handle_updated_at" BEFORE UPDATE ON "public"."user_gcp_config" FOR EACH ROW EXECUTE FUNCTION "extensions"."moddatetime"('updated_at');



CREATE OR REPLACE TRIGGER "protect_admin_column_trigger" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."protect_admin_column"();



CREATE OR REPLACE TRIGGER "set_paid_at_trigger" BEFORE INSERT OR UPDATE ON "public"."monthly_statements" FOR EACH ROW EXECUTE FUNCTION "public"."handle_payment_status_change"();



CREATE OR REPLACE TRIGGER "set_updated_at_continuity_state" BEFORE UPDATE ON "public"."continuity_state" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_media_projects" BEFORE UPDATE ON "public"."media_projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_project_settings" BEFORE UPDATE ON "public"."project_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_tasks" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_user_settings" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_video_projects" BEFORE UPDATE ON "public"."video_projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_api_keys_updated_at" BEFORE UPDATE ON "public"."user_api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_projects"
    ADD CONSTRAINT "media_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_statements"
    ADD CONSTRAINT "monthly_statements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_settings"
    ADD CONSTRAINT "project_settings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."media_projects"("id") ON DELETE CASCADE;



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



CREATE POLICY "Users can delete their own config" ON "public"."user_gcp_config" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own keys" ON "public"."user_api_keys" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert their own config" ON "public"."user_gcp_config" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own statements" ON "public"."monthly_statements" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage settings for their owned projects" ON "public"."project_settings" USING ((EXISTS ( SELECT 1
   FROM "public"."media_projects"
  WHERE (("media_projects"."id" = "project_settings"."project_id") AND ("media_projects"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."media_projects"
  WHERE (("media_projects"."id" = "project_settings"."project_id") AND ("media_projects"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own continuity state" ON "public"."continuity_state" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "continuity_state"."task_id") AND ("tasks"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "continuity_state"."task_id") AND ("tasks"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own general settings" ON "public"."user_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own media projects" ON "public"."media_projects" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own tasks" ON "public"."tasks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own video projects" ON "public"."video_projects" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own keys" ON "public"."user_api_keys" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own config" ON "public"."user_gcp_config" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own statements" ON "public"."monthly_statements" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own keys" ON "public"."user_api_keys" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view steps for their own tasks" ON "public"."task_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "task_steps"."task_id") AND ("tasks"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own config" ON "public"."user_gcp_config" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own statements" ON "public"."monthly_statements" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view videos in owned media projects" ON "public"."video_projects" FOR SELECT USING ((("project_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."media_projects"
  WHERE (("media_projects"."id" = "video_projects"."project_id") AND ("media_projects"."user_id" = "auth"."uid"()))))));



ALTER TABLE "public"."continuity_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_statements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_gcp_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."video_projects" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




























































































































































GRANT ALL ON FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_task_step"("p_task_id" "uuid", "p_step" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."append_to_output_array"("p_task_id" "uuid", "p_key" "text", "p_item" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_analytics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_analytics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_analytics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_incomplete_videos"("p_user_id" "uuid") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."protect_admin_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_admin_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_admin_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_payment_month"("target_user_id" "uuid", "target_month_date" "text") TO "service_role";



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



GRANT ALL ON FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_payment_month"("target_user_id" "uuid", "target_month_date" "date") TO "service_role";


















GRANT ALL ON TABLE "public"."continuity_state" TO "anon";
GRANT ALL ON TABLE "public"."continuity_state" TO "authenticated";
GRANT ALL ON TABLE "public"."continuity_state" TO "service_role";



GRANT ALL ON TABLE "public"."media_projects" TO "anon";
GRANT ALL ON TABLE "public"."media_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."media_projects" TO "service_role";



GRANT ALL ON TABLE "public"."project_settings" TO "anon";
GRANT ALL ON TABLE "public"."project_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."project_settings" TO "service_role";



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



GRANT ALL ON TABLE "public"."video_projects" TO "anon";
GRANT ALL ON TABLE "public"."video_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."video_projects" TO "service_role";









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































