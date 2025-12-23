


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



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






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


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


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

SET default_tablespace = '';

SET default_table_access_method = "heap";


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
    CONSTRAINT "tasks_current_phase_check" CHECK ((("current_phase" IS NULL) OR ("current_phase" = ANY (ARRAY['preprocessing'::"text", 'writing'::"text", 'postprocessing'::"text", 'audio_generation'::"text", 'audio_processing'::"text", 'image_generation'::"text", 'video_generation'::"text", 'compositing'::"text", 'encoding'::"text", 'uploading'::"text"])))),
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
    "joining_reason" "text"[]
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_task_id_key" UNIQUE ("task_id");



ALTER TABLE ONLY "public"."media_projects"
    ADD CONSTRAINT "media_projects_pkey" PRIMARY KEY ("id");



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



CREATE OR REPLACE TRIGGER "set_updated_at_continuity_state" BEFORE UPDATE ON "public"."continuity_state" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_media_projects" BEFORE UPDATE ON "public"."media_projects" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_project_settings" BEFORE UPDATE ON "public"."project_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_tasks" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at_user_settings" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_user_api_keys_updated_at" BEFORE UPDATE ON "public"."user_api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."continuity_state"
    ADD CONSTRAINT "continuity_state_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_projects"
    ADD CONSTRAINT "media_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can insert own keys" ON "public"."user_api_keys" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own profile" ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



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



CREATE POLICY "Users can update own keys" ON "public"."user_api_keys" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own profile" ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own keys" ON "public"."user_api_keys" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view steps for their own tasks" ON "public"."task_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."tasks"
  WHERE (("tasks"."id" = "task_steps"."task_id") AND ("tasks"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."continuity_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_api_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;




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



GRANT ALL ON FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_task_step_stats"("p_task_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."merge_task_output"("p_task_id" "uuid", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_task_step"("p_task_id" "uuid", "p_step_id" "text", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















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



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









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































