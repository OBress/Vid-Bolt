-- RPC: Update Get Users Paginated to return status string
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
    last_month_status text -- Changed from boolean paid_last_month
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    prev_month_str text;
BEGIN
    -- Check for admin
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

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
            (
                SELECT ms.status::text
                FROM public.monthly_statements ms 
                WHERE ms.user_id = u.id 
                  AND ms.month_date = date(prev_month_str)
            ), 
            'draft'
        ) as last_month_status
    FROM filtered_users u
    ORDER BY u.date_joined DESC
    LIMIT per_page
    OFFSET (page - 1) * per_page;
END;
$$;

-- RPC: Verify Payment Month
CREATE OR REPLACE FUNCTION public.verify_payment_month(
    target_user_id uuid,
    target_month_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
