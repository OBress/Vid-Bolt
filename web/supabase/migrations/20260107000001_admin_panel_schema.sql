-- Create account_status type
DO $$ BEGIN
    CREATE TYPE public.account_status AS ENUM ('pending', 'active', 'paused', 'banned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add status column to users if it doesn't exist
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS status public.account_status DEFAULT 'pending'::public.account_status;

-- Update existing users to active (migration path)
UPDATE public.users SET status = 'active' WHERE status = 'pending';

-- Reset default to pending for future users
ALTER TABLE public.users ALTER COLUMN status SET DEFAULT 'pending'::public.account_status;

-- RPC: Get Admin Analytics
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
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true) THEN
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

-- RPC: Get Users Paginated
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
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true) THEN
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

-- RPC: Update User Status
CREATE OR REPLACE FUNCTION public.update_user_status(
    target_user_id uuid,
    new_status public.account_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true) THEN
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
