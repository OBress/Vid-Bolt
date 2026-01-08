-- RPC: Update Get Users Paginated to check current AND previous month
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
    last_month_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
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
