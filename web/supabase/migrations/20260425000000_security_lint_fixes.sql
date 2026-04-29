-- =============================================================================
-- Security Lint Fixes
-- =============================================================================
-- Resolves all Supabase linter findings with ZERO functionality impact:
--
--   ERROR  rls_disabled_in_public       → admin_platform_costs
--   WARN   function_search_path_mutable → get_request_role
--   WARN   function_search_path_mutable → reset_active_gpu_productions
--   WARN   function_search_path_mutable → increment_active_gpu_productions
--   WARN   function_search_path_mutable → decrement_active_gpu_productions
--   WARN   function_search_path_mutable → get_stock_media_by_entity
--   WARN   function_search_path_mutable → update_video_project_state_updated_at
--   WARN   function_search_path_mutable → update_render_jobs_updated_at
--
-- Safety notes:
--   - admin_platform_costs: all callers (platform-costs API route) already use
--     SUPABASE_SERVICE_ROLE_KEY. service_role bypasses RLS, so adding RLS +
--     a service_role-only policy is a no-op for all existing access patterns.
--   - All function bodies are unchanged — only SET search_path TO '' is added.
--     Every table reference inside these functions was already schema-qualified
--     (public.*), so pinning search_path has no effect on query resolution.
--   - Trigger functions (update_video_project_state_updated_at,
--     update_render_jobs_updated_at) only reference NEW/OLD pseudo-records —
--     no table lookups at all. Trigger-to-function binding is stored by OID
--     (not name), so CREATE OR REPLACE preserves the live trigger attachment.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. admin_platform_costs — Enable RLS + service_role-only policy
-- ---------------------------------------------------------------------------
-- All access is via server-side admin routes using the service_role key.
-- service_role bypasses RLS entirely, so existing routes are unaffected.
-- This just closes the PostgREST exposure gap for the anon/authenticated keys.

ALTER TABLE public.admin_platform_costs ENABLE ROW LEVEL SECURITY;

-- Only service_role (server-side admin API routes) can read or write this table.
-- No user-facing policies are needed because users never access this table directly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'admin_platform_costs'
      AND policyname = 'service_role_full_access_admin_platform_costs'
  ) THEN
    CREATE POLICY "service_role_full_access_admin_platform_costs"
      ON public.admin_platform_costs FOR ALL
      USING     (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. get_request_role — Pin search_path
-- ---------------------------------------------------------------------------
-- Used internally by column-protection triggers to detect service_role.
-- Only calls current_setting() — a built-in pg function, not schema-dependent.
-- Removing SECURITY DEFINER would be wrong here (it doesn't have it anyway);
-- we're only adding the search_path pin.

CREATE OR REPLACE FUNCTION public.get_request_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT COALESCE(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
      ''
    )
  );
$$;

COMMENT ON FUNCTION public.get_request_role() IS
'Returns the JWT role claim, checking both old (request.jwt.claim.role) and new (request.jwt.claims JSON) PostgREST formats.';


-- ---------------------------------------------------------------------------
-- 3. reset_active_gpu_productions — Pin search_path
-- ---------------------------------------------------------------------------
-- Body uses public.user_gcp_config — already fully schema-qualified.

CREATE OR REPLACE FUNCTION public.reset_active_gpu_productions(p_user_id UUID, p_count INTEGER DEFAULT 0)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.user_gcp_config
  SET active_gpu_productions = p_count
  WHERE user_id = p_user_id;
$$;


-- ---------------------------------------------------------------------------
-- 4. increment_active_gpu_productions — Pin search_path
-- ---------------------------------------------------------------------------
-- Body uses public.user_gcp_config — already fully schema-qualified.

CREATE OR REPLACE FUNCTION public.increment_active_gpu_productions(p_user_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  UPDATE public.user_gcp_config
  SET active_gpu_productions = COALESCE(active_gpu_productions, 0) + 1
  WHERE user_id = p_user_id;
$$;


-- ---------------------------------------------------------------------------
-- 5. decrement_active_gpu_productions — Pin search_path
-- ---------------------------------------------------------------------------
-- Body uses public.user_gcp_config — already fully schema-qualified.
-- Logic is unchanged: atomic decrement + shutdown-flag check in one round-trip.

CREATE OR REPLACE FUNCTION public.decrement_active_gpu_productions(p_user_id UUID)
RETURNS TABLE(new_count INTEGER, should_shutdown BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_new_count          INTEGER;
  v_shutdown_requested BOOLEAN;
  v_status             TEXT;
BEGIN
  -- Atomic decrement + read in a single UPDATE ... RETURNING
  UPDATE public.user_gcp_config
  SET active_gpu_productions = GREATEST(COALESCE(active_gpu_productions, 1) - 1, 0)
  WHERE user_id = p_user_id
  RETURNING
    active_gpu_productions,
    shutdown_after_production_requested,
    status
  INTO v_new_count, v_shutdown_requested, v_status;

  -- If no row found, return safe defaults
  IF NOT FOUND THEN
    new_count      := 0;
    should_shutdown := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  new_count       := v_new_count;
  should_shutdown := (v_new_count = 0 AND v_shutdown_requested = TRUE AND v_status = 'RUNNING');

  -- If shutting down, clear the flag atomically
  IF should_shutdown THEN
    UPDATE public.user_gcp_config
    SET shutdown_after_production_requested = FALSE
    WHERE user_id = p_user_id;
  END IF;

  RETURN NEXT;
END;
$$;


-- ---------------------------------------------------------------------------
-- 6. get_stock_media_by_entity — Pin search_path
-- ---------------------------------------------------------------------------
-- Body uses public.stock_media — already fully schema-qualified.

CREATE OR REPLACE FUNCTION public.get_stock_media_by_entity(
  p_video_id   uuid,
  p_entity_name text
) RETURNS TABLE(id uuid, r2_key text, metadata jsonb)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  SELECT
    stock_media.id,
    stock_media.r2_key,
    stock_media.metadata
  FROM public.stock_media
  WHERE
    stock_media.video_id    = p_video_id
    AND stock_media.entity_name = p_entity_name
  ORDER BY stock_media.created_at DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_stock_media_by_entity IS
'Find stock media by exact entity name match within a video. Returns most recent match.';


-- ---------------------------------------------------------------------------
-- 7. update_video_project_state_updated_at — Pin search_path
-- ---------------------------------------------------------------------------
-- Trigger function: only touches NEW.updated_at (a pseudo-record field).
-- No table references inside the body — search_path has zero effect on logic.
-- CREATE OR REPLACE preserves the existing trigger binding (stored by OID).

CREATE OR REPLACE FUNCTION public.update_video_project_state_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. update_render_jobs_updated_at — Pin search_path
-- ---------------------------------------------------------------------------
-- Identical pattern to above. Trigger binding is preserved by OID.

CREATE OR REPLACE FUNCTION public.update_render_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
