-- ============================================================================
-- Notification System
-- ============================================================================
-- Adds a notifications table and supporting RPCs for admin-to-user messaging.
-- Admins can send notifications to specific users or broadcast to all.
-- Users can view, mark as read, and clear their notifications.

-- ============================================================================
-- Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    message     TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'info'
                CHECK (type IN ('info', 'warning', 'success', 'update')),
    is_read     BOOLEAN NOT NULL DEFAULT false,
    sent_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read)
    WHERE is_read = false;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own notifications (clear)
CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- RPC: Admin send notification (single user or broadcast)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_send_notification(
    p_target_user_id UUID,          -- NULL = broadcast to all active users
    p_title          TEXT,
    p_message        TEXT,
    p_type           TEXT DEFAULT 'info'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id   UUID;
    v_is_admin    BOOLEAN;
    v_inserted    INT := 0;
BEGIN
    -- Auth check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT is_admin INTO v_is_admin
    FROM public.users WHERE id = v_caller_id;

    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    -- Validate type
    IF p_type NOT IN ('info', 'warning', 'success', 'update') THEN
        RAISE EXCEPTION 'Invalid notification type: %', p_type;
    END IF;

    IF p_target_user_id IS NOT NULL THEN
        -- Send to a specific user
        INSERT INTO public.notifications (user_id, title, message, type, sent_by)
        VALUES (p_target_user_id, p_title, p_message, p_type, v_caller_id);
        v_inserted := 1;
    ELSE
        -- Broadcast: insert one row per active user (excluding caller)
        INSERT INTO public.notifications (user_id, title, message, type, sent_by)
        SELECT id, p_title, p_message, p_type, v_caller_id
        FROM public.users
        WHERE status = 'active'
          AND id != v_caller_id;

        GET DIAGNOSTICS v_inserted = ROW_COUNT;
    END IF;

    RETURN json_build_object(
        'success',  true,
        'sent_to',  v_inserted,
        'broadcast', (p_target_user_id IS NULL)
    );
END;
$$;

-- ============================================================================
-- RPC: Get notifications for the calling user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_notifications(
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id         UUID,
    title      TEXT,
    message    TEXT,
    type       TEXT,
    is_read    BOOLEAN,
    created_at TIMESTAMPTZ,
    sent_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id,
        n.title,
        n.message,
        n.type,
        n.is_read,
        n.created_at,
        u.name AS sent_by_name
    FROM public.notifications n
    LEFT JOIN public.users u ON u.id = n.sent_by
    WHERE n.user_id = auth.uid()
    ORDER BY n.created_at DESC
    LIMIT p_limit;
END;
$$;

-- ============================================================================
-- RPC: Mark notification as read
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_notification_read(
    p_notification_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE id = p_notification_id
      AND user_id = auth.uid();
END;
$$;

-- ============================================================================
-- RPC: Mark all notifications as read for the calling user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.notifications
    SET is_read = true
    WHERE user_id = auth.uid()
      AND is_read = false;
END;
$$;

-- ============================================================================
-- RPC: Clear (delete) all notifications for the calling user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM public.notifications
    WHERE user_id = auth.uid();
END;
$$;

-- ============================================================================
-- RPC: Admin notification history (recently sent)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_notification_history(
    p_limit INT DEFAULT 50
)
RETURNS TABLE (
    id          UUID,
    title       TEXT,
    message     TEXT,
    type        TEXT,
    created_at  TIMESTAMPTZ,
    sent_by_name TEXT,
    recipient_name TEXT,
    recipient_email TEXT,
    is_broadcast BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID;
    v_is_admin  BOOLEAN;
BEGIN
    v_caller_id := auth.uid();
    SELECT u.is_admin INTO v_is_admin
    FROM public.users u WHERE u.id = v_caller_id;

    IF NOT COALESCE(v_is_admin, false) THEN
        RAISE EXCEPTION 'Admin access required';
    END IF;

    RETURN QUERY
    SELECT DISTINCT ON (sub.id)
        sub.id,
        sub.title,
        sub.message,
        sub.type,
        sub.created_at,
        sub.sent_by_name,
        sub.recipient_name,
        sub.recipient_email,
        sub.is_broadcast
    FROM (
        SELECT
            n.id,
            n.title,
            n.message,
            n.type,
            n.created_at,
            sender.name   AS sent_by_name,
            recip.name    AS recipient_name,
            recip.email   AS recipient_email,
            -- A broadcast is identified by multiple rows sharing the same
            -- (title, message, type, sent_by, created_at) tuple.
            (COUNT(*) OVER (
                PARTITION BY n.title, n.message, n.type, n.sent_by,
                             date_trunc('second', n.created_at)
            ) > 1) AS is_broadcast
        FROM public.notifications n
        LEFT JOIN public.users sender ON sender.id = n.sent_by
        LEFT JOIN public.users recip  ON recip.id  = n.user_id
        ORDER BY n.created_at DESC
    ) sub
    ORDER BY sub.id, sub.created_at DESC
    LIMIT p_limit;
END;
$$;

-- ============================================================================
-- Enable Realtime for the notifications table
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
