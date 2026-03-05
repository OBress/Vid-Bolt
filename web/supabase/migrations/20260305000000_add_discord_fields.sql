-- ============================================================================
-- Migration: Add Discord identity fields + clean slate for Discord OAuth
-- ============================================================================
-- 1. Wipes all existing user data (pre-launch cleanup)
-- 2. Adds Discord identity columns to public.users
-- 3. Updates get_users_paginated RPC to return Discord fields
-- ============================================================================

-- ============================================================================
-- PART 1: Clean slate — remove all existing users and cascaded data
-- ============================================================================
-- All child tables use ON DELETE CASCADE, so deleting from auth.users
-- will automatically clean: public.users, video_projects, tasks,
-- monthly_statements, user_api_keys, user_gcp_config, user_settings,
-- render_jobs, pending_gpu_jobs, gpu_hours_transactions, etc.

DELETE FROM auth.users;

-- ============================================================================
-- PART 2: Add Discord columns (idempotent)
-- ============================================================================

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS discord_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS discord_username text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS discord_avatar text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS in_vidbolt_server boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON public.users (discord_id);

COMMENT ON COLUMN public.users.discord_id IS 'Discord user ID from OAuth identity';
COMMENT ON COLUMN public.users.discord_username IS 'Discord username (e.g. user#1234 or new-style username)';
COMMENT ON COLUMN public.users.discord_avatar IS 'Discord avatar hash for CDN URL construction';
COMMENT ON COLUMN public.users.in_vidbolt_server IS 'Whether user is in the VidBolt Discord server (checked at login)';

-- ============================================================================
-- PART 3: Update get_users_paginated to include Discord fields
-- PostgreSQL requires DROP before changing RETURNS TABLE signature.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_users_paginated(int, int, text, text);

CREATE OR REPLACE FUNCTION public.get_users_paginated(page integer DEFAULT 1, per_page integer DEFAULT 20, search_text text DEFAULT ''::text, status_filter text DEFAULT 'all'::text)
RETURNS TABLE(id uuid, email text, name text, username text, is_admin boolean, status public.account_status, date_joined timestamp with time zone, total_count bigint, last_month_status text, discord_username text, discord_avatar text, in_vidbolt_server boolean)
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
