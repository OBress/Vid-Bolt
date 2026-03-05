-- ============================================================================
-- Migration: Fix dashboard permissions on ALL protection triggers
-- ============================================================================
-- The Supabase dashboard Table Editor connects as postgres/supabase_admin,
-- but all 4 protection triggers only checked for service_role JWT.
-- This adds session_user checks so the dashboard can modify ANY column.
-- Also adds auto-approve trigger for admin users.
-- ============================================================================

-- ============================================================================
-- 1. Fix: protect_users_sensitive_columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Allow service_role (API calls from workers/server)
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- Allow Supabase dashboard / direct SQL (postgres, supabase_admin)
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Permission denied: cannot modify is_admin';
  END IF;
  IF NEW.gpu_hours_balance IS DISTINCT FROM OLD.gpu_hours_balance THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gpu_hours_balance';
  END IF;
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify stripe_customer_id';
  END IF;
  IF NEW.account_tier IS DISTINCT FROM OLD.account_tier THEN
    RAISE EXCEPTION 'Permission denied: cannot modify account_tier';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify status';
  END IF;
  IF NEW.date_joined IS DISTINCT FROM OLD.date_joined THEN
    RAISE EXCEPTION 'Permission denied: cannot modify date_joined';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Permission denied: cannot modify email';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. Fix: protect_tasks_sensitive_columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_tasks_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.status';
  END IF;
  IF NEW.current_phase IS DISTINCT FROM OLD.current_phase THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.current_phase';
  END IF;
  IF NEW.current_step IS DISTINCT FROM OLD.current_step THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.current_step';
  END IF;
  IF NEW.progress_percent IS DISTINCT FROM OLD.progress_percent THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.progress_percent';
  END IF;
  IF NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.error_message';
  END IF;
  IF NEW.retry_count IS DISTINCT FROM OLD.retry_count THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.retry_count';
  END IF;
  IF NEW.max_retries IS DISTINCT FROM OLD.max_retries THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.max_retries';
  END IF;
  IF NEW.inngest_run_id IS DISTINCT FROM OLD.inngest_run_id THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.inngest_run_id';
  END IF;
  IF NEW.output_data IS DISTINCT FROM OLD.output_data THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.output_data';
  END IF;
  IF NEW.steps IS DISTINCT FROM OLD.steps THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.steps';
  END IF;
  IF NEW.research IS DISTINCT FROM OLD.research THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.research';
  END IF;
  IF NEW.master_outline IS DISTINCT FROM OLD.master_outline THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.master_outline';
  END IF;
  IF NEW.detailed_outline IS DISTINCT FROM OLD.detailed_outline THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.detailed_outline';
  END IF;
  IF NEW.characters IS DISTINCT FROM OLD.characters THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.characters';
  END IF;
  IF NEW.settings IS DISTINCT FROM OLD.settings THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.settings';
  END IF;
  IF NEW.chapters IS DISTINCT FROM OLD.chapters THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.chapters';
  END IF;
  IF NEW.final_script IS DISTINCT FROM OLD.final_script THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.final_script';
  END IF;
  IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.started_at';
  END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify tasks.completed_at';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. Fix: protect_monthly_statements_sensitive_columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_monthly_statements_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    RAISE EXCEPTION 'Permission denied: cannot modify commission_rate';
  END IF;
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify paid_at';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'draft' AND NEW.status = 'pending_verification') THEN
      RAISE EXCEPTION 'Permission denied: invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. Fix: protect_user_gcp_config_sensitive_columns
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_user_gcp_config_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF public.get_request_role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.gcp_refresh_token IS DISTINCT FROM OLD.gcp_refresh_token THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_refresh_token';
  END IF;
  IF NEW.gcp_access_token IS DISTINCT FROM OLD.gcp_access_token THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_access_token';
  END IF;
  IF NEW.gcp_token_expires_at IS DISTINCT FROM OLD.gcp_token_expires_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_token_expires_at';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Permission denied: cannot modify user_gcp_config.status';
  END IF;
  IF NEW.external_ip IS DISTINCT FROM OLD.external_ip THEN
    RAISE EXCEPTION 'Permission denied: cannot modify external_ip';
  END IF;
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify last_seen_at';
  END IF;
  IF NEW.last_gpu_activity_at IS DISTINCT FROM OLD.last_gpu_activity_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify last_gpu_activity_at';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Auto-approve admin users
-- When is_admin is set to true, automatically set status to 'active'
-- so admins are never stuck in pending/waitlist.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_approve_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NEW.is_admin = true AND NEW.status != 'active' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_approve_admin_trigger ON public.users;
CREATE TRIGGER auto_approve_admin_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_approve_admin();
