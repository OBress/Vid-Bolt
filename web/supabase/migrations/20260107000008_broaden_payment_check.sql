-- Broaden "paid_last_month" check to include current month

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
    prev_month_date date;
    curr_month_date date;
BEGIN
    -- Check if requester is admin (aliased to avoid ambiguity with output 'id')
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Calculate previous and current month dates (YYYY-MM-01)
    prev_month_date := date_trunc('month', now() - interval '1 month')::date;
    curr_month_date := date_trunc('month', now())::date;

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
                  AND ms.status = 'paid'
                  AND (ms.month_date = prev_month_date OR ms.month_date = curr_month_date)
            ), 
            false
        ) as paid_last_month
    FROM filtered_users u
    ORDER BY u.date_joined DESC
    LIMIT per_page
    OFFSET (page - 1) * per_page;
END;
$$;
