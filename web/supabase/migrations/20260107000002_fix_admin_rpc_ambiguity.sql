-- Fix ambiguous column references in RPCs by using explicit table aliases
-- This migration replaces the functions created in 20260107000001

-- 1. Fix get_admin_analytics
CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

-- 2. Fix get_users_paginated
CREATE OR REPLACE FUNCTION public.get_users_paginated(
    page int DEFAULT 1,
    per_page int DEFAULT 20,
    search_text text DEFAULT '',
    status_filter text DEFAULT 'all'
)
RETURNS TABLE (
    id uuid,
    email text,
    name text,
    username text,
    is_admin boolean,
    status public.account_status,
    date_joined timestamptz,
    total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if requester is admin using alias 'u'
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
        (SELECT count(*) FROM filtered_users)::bigint as total_count
    FROM filtered_users u
    ORDER BY u.date_joined DESC
    LIMIT per_page
    OFFSET (page - 1) * per_page;
END;
$$;

-- 3. Fix update_user_status
CREATE OR REPLACE FUNCTION public.update_user_status(
    target_user_id uuid,
    new_status public.account_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
