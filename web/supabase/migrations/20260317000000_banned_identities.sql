-- ============================================================================
-- Migration: Banned Identities — persistent ban list for Approve/Reject/Ban
-- ============================================================================
-- 1. Creates banned_identities table (survives account deletion)
-- 2. Adds admin RPCs: ban user, unban identity, check banned, list banned
-- ============================================================================

-- ============================================================================
-- PART 1: Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.banned_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  discord_id TEXT,
  banned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.banned_identities ENABLE ROW LEVEL SECURITY;

-- Only admins (via RPCs) interact with this table; no direct access
CREATE POLICY "Service role full access on banned_identities"
  ON public.banned_identities
  FOR ALL
  USING (public.get_request_role() = 'service_role')
  WITH CHECK (public.get_request_role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_banned_identities_email ON public.banned_identities (email);
CREATE INDEX IF NOT EXISTS idx_banned_identities_discord_id ON public.banned_identities (discord_id);

COMMENT ON TABLE public.banned_identities IS 'Persistent ban list that survives account deletion. Checked on every Discord OAuth login.';

-- ============================================================================
-- PART 2: check_banned_identity — used by auth callback
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_banned_identity(
  p_email TEXT DEFAULT NULL,
  p_discord_id TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.banned_identities bi
    WHERE
      (p_email IS NOT NULL AND bi.email = p_email)
      OR
      (p_discord_id IS NOT NULL AND bi.discord_id = p_discord_id)
  );
END;
$$;

COMMENT ON FUNCTION public.check_banned_identity(TEXT, TEXT)
  IS 'Returns true if the given email or discord_id is in the ban list. Called from the auth callback on every login.';

-- ============================================================================
-- PART 3: admin_ban_user — ban + delete user, persist identifiers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  target_user_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID;
  v_email TEXT;
  v_discord_id TEXT;
  v_username TEXT;
  v_ban_id UUID;
  r2_prefixes TEXT[] := ARRAY[]::TEXT[];
  video_record RECORD;
  statement_record RECORD;
  media_record RECORD;
BEGIN
  caller_id := auth.uid();

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = caller_id AND u.is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  IF target_user_id = caller_id THEN
    RAISE EXCEPTION 'Cannot ban your own account';
  END IF;

  -- Get user identifiers before deletion
  SELECT u.email, u.discord_id, u.username
  INTO v_email, v_discord_id, v_username
  FROM public.users u WHERE u.id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;

  -- Insert into banned_identities
  INSERT INTO public.banned_identities (email, discord_id, banned_by, reason)
  VALUES (v_email, v_discord_id, caller_id, p_reason)
  RETURNING id INTO v_ban_id;

  -- Collect R2 prefixes for cleanup (same logic as admin_delete_user)
  FOR video_record IN
    SELECT id FROM public.video_projects WHERE user_id = target_user_id
  LOOP
    r2_prefixes := array_append(r2_prefixes, 'audio/' || target_user_id::TEXT || '/' || video_record.id::TEXT || '/');
  END LOOP;

  r2_prefixes := array_append(r2_prefixes, 'gpu-api-test/' || target_user_id::TEXT || '/');

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

  FOR media_record IN
    SELECT picture_url FROM public.media_projects
    WHERE user_id = target_user_id AND picture_url IS NOT NULL
  LOOP
    r2_prefixes := array_append(r2_prefixes, media_record.picture_url);
  END LOOP;

  -- Delete user from public.users (cascades to child tables)
  DELETE FROM public.users WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'username', v_username,
    'email', v_email,
    'discord_id', v_discord_id,
    'ban_id', v_ban_id,
    'r2_prefixes', to_jsonb(r2_prefixes),
    'note', 'Caller must also delete from auth.users via Supabase Admin API'
  );
END;
$$;

COMMENT ON FUNCTION public.admin_ban_user(UUID, TEXT)
  IS 'Bans a user by persisting their email + discord_id in banned_identities, then deletes from public.users. Caller must also delete from auth.users.';

-- ============================================================================
-- PART 4: admin_unban_identity — remove from ban list
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_unban_identity(
  p_banned_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  DELETE FROM public.banned_identities WHERE id = p_banned_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Banned identity not found: %', p_banned_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_unban_identity(UUID)
  IS 'Removes an identity from the ban list, allowing the user to re-register.';

-- ============================================================================
-- PART 5: get_banned_identities — paginated list for admin panel
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_banned_identities(
  page integer DEFAULT 1,
  per_page integer DEFAULT 20
) RETURNS TABLE(
  id UUID,
  email TEXT,
  discord_id TEXT,
  banned_by_name TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  RETURN QUERY
  SELECT
    bi.id,
    bi.email,
    bi.discord_id,
    COALESCE(u.name, u.username, u.email) AS banned_by_name,
    bi.reason,
    bi.created_at,
    (SELECT count(*) FROM public.banned_identities)::BIGINT AS total_count
  FROM public.banned_identities bi
  LEFT JOIN public.users u ON u.id = bi.banned_by
  ORDER BY bi.created_at DESC
  LIMIT per_page
  OFFSET (page - 1) * per_page;
END;
$$;

COMMENT ON FUNCTION public.get_banned_identities(INTEGER, INTEGER)
  IS 'Paginated list of banned identities for the admin panel.';

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON TABLE public.banned_identities TO service_role;
GRANT ALL ON FUNCTION public.check_banned_identity(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.admin_ban_user(UUID, TEXT) TO authenticated, service_role;
GRANT ALL ON FUNCTION public.admin_unban_identity(UUID) TO authenticated, service_role;
GRANT ALL ON FUNCTION public.get_banned_identities(INTEGER, INTEGER) TO authenticated, service_role;
