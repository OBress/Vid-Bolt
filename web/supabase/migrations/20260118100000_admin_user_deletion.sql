-- Admin User Deletion Functions
-- ============================================================================
-- Provides secure admin-only functions for:
-- 1. Wiping user data (keeps account, settings, and media projects)
-- 2. Full user deletion (removes everything)
-- ============================================================================

-- Function to wipe user-generated content (keeps account structure)
-- Returns the user_id for R2 cleanup purposes
CREATE OR REPLACE FUNCTION public.admin_wipe_user_data(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- Get the calling user's ID
    caller_id := auth.uid();
    
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- Prevent self-deletion
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Cannot wipe your own data';
    END IF;
    
    -- Verify target user exists and get username
    SELECT username INTO target_username FROM public.users WHERE id = target_user_id;
    IF target_username IS NULL THEN
        -- Try to get email if username is null
        SELECT email INTO target_username FROM public.users WHERE id = target_user_id;
    END IF;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    -- Collect R2 prefixes from video_projects before deletion
    -- Audio files are stored at: audio/{userId}/{videoId}/
    FOR video_record IN 
        SELECT id FROM public.video_projects WHERE user_id = target_user_id
    LOOP
        r2_prefixes := array_append(r2_prefixes, 'audio/' || target_user_id::TEXT || '/' || video_record.id::TEXT || '/');
    END LOOP;
    
    -- Add GPU API test prefix
    r2_prefixes := array_append(r2_prefixes, 'gpu-api-test/' || target_user_id::TEXT || '/');
    
    -- Collect payment proof URLs from monthly_statements
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
    
    -- Delete video_projects (cascades will handle linked tasks via FK SET NULL)
    DELETE FROM public.video_projects WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_videos = ROW_COUNT;
    
    -- Delete tasks (cascades to task_steps and continuity_state)
    DELETE FROM public.tasks WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_tasks = ROW_COUNT;
    
    -- Delete monthly_statements
    DELETE FROM public.monthly_statements WHERE user_id = target_user_id;
    GET DIAGNOSTICS deleted_statements = ROW_COUNT;
    
    -- Return summary
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

ALTER FUNCTION public.admin_wipe_user_data(UUID) OWNER TO postgres;

COMMENT ON FUNCTION public.admin_wipe_user_data IS 
'Admin function to wipe all user-generated content while preserving the account.
Deletes: tasks, video_projects, monthly_statements
Keeps: users, user_api_keys, user_settings, user_gcp_config, media_projects
Returns R2 prefixes that need cleanup.';


-- Function to fully delete a user (removes from public.users, cascades to most tables)
-- Note: Caller must also delete from auth.users via Supabase Admin API
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- Get the calling user's ID
    caller_id := auth.uid();
    
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- Prevent self-deletion
    IF target_user_id = caller_id THEN
        RAISE EXCEPTION 'Cannot delete your own account';
    END IF;
    
    -- Verify target user exists and get info
    SELECT username, email INTO target_username, target_email 
    FROM public.users WHERE id = target_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;
    
    -- Collect R2 prefixes from video_projects before deletion
    FOR video_record IN 
        SELECT id FROM public.video_projects WHERE user_id = target_user_id
    LOOP
        r2_prefixes := array_append(r2_prefixes, 'audio/' || target_user_id::TEXT || '/' || video_record.id::TEXT || '/');
    END LOOP;
    
    -- Add GPU API test prefix
    r2_prefixes := array_append(r2_prefixes, 'gpu-api-test/' || target_user_id::TEXT || '/');
    
    -- Collect payment proof URLs from monthly_statements
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
    
    -- Collect media project picture URLs
    FOR media_record IN 
        SELECT picture_url FROM public.media_projects 
        WHERE user_id = target_user_id AND picture_url IS NOT NULL
    LOOP
        r2_prefixes := array_append(r2_prefixes, media_record.picture_url);
    END LOOP;
    
    -- Delete from public.users (cascades to most tables via FK ON DELETE CASCADE)
    -- Tables that cascade: user_api_keys, tasks, video_projects, monthly_statements
    DELETE FROM public.users WHERE id = target_user_id;
    
    -- Return summary with info needed for auth deletion and R2 cleanup
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

ALTER FUNCTION public.admin_delete_user(UUID) OWNER TO postgres;

COMMENT ON FUNCTION public.admin_delete_user IS 
'Admin function to fully delete a user from the system.
Deletes the user from public.users which cascades to most related tables.
Returns R2 prefixes that need cleanup.
IMPORTANT: Caller must also delete from auth.users via Supabase Admin API.';


-- Function to get user info for confirmation dialog
CREATE OR REPLACE FUNCTION public.admin_get_user_for_deletion(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    caller_id UUID;
    result JSONB;
    task_count INT;
    video_count INT;
    statement_count INT;
BEGIN
    -- Get the calling user's ID
    caller_id := auth.uid();
    
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- Count related records
    SELECT COUNT(*) INTO task_count FROM public.tasks WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO video_count FROM public.video_projects WHERE user_id = target_user_id;
    SELECT COUNT(*) INTO statement_count FROM public.monthly_statements WHERE user_id = target_user_id;
    
    -- Get user info
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

ALTER FUNCTION public.admin_get_user_for_deletion(UUID) OWNER TO postgres;

COMMENT ON FUNCTION public.admin_get_user_for_deletion IS 
'Admin function to get user details and data counts for the deletion confirmation dialog.';
