-- RPC: Get Users Paginated with Payment Status
-- This replaces or updates the existing get_users_paginated to include paid_last_month

-- Drop first because return type is changing (and to handle potential previous failure states)
DROP FUNCTION IF EXISTS public.get_users_paginated(int, int, text, text);

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
    total_count bigint,
    paid_last_month boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    prev_month_str text;
BEGIN
    -- Check if requester is admin (aliased to avoid ambiguity with output 'id')
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Calculate previous month string (YYYY-MM-01) relative to now
    -- If today is 2026-02-15, we want to check for '2026-01-01'
    prev_month_str := to_char(date_trunc('month', now() - interval '1 month'), 'YYYY-MM-DD');

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
            EXISTS (
                SELECT 1 
                FROM public.monthly_statements ms 
                WHERE ms.user_id = u.id 
                  AND ms.month_date = prev_month_str
                  AND ms.status = 'paid'
            ), 
            false
        ) as paid_last_month
    FROM filtered_users u
    ORDER BY u.date_joined DESC
    LIMIT per_page
    OFFSET (page - 1) * per_page;
END;
$$;

-- RPC: Get User Payment History
CREATE OR REPLACE FUNCTION public.get_user_payment_history(target_user_id uuid)
RETURNS SETOF public.monthly_statements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if requester is admin (aliased)
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

-- RPC: Reset Payment Month
-- Resets status to draft and clears proof URL.
-- Does NOT delete the R2 file (that should be handled by the caller/server action).
CREATE OR REPLACE FUNCTION public.reset_payment_month(
    target_user_id uuid,
    target_month_date text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
      AND month_date = target_month_date;
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Statement not found for user % and month %', target_user_id, target_month_date;
    END IF;
END;
$$;
