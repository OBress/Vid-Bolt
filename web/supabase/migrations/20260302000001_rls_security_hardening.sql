-- ============================================================================
-- RLS SECURITY HARDENING — Column-Level Protection Triggers
-- ============================================================================
-- Prevents users from modifying sensitive columns via the Supabase client.
-- Service role and postgres are always allowed full access.
-- ============================================================================

-- ============================================================================
-- 1. USERS TABLE — Protect financial, admin, and status columns
-- ============================================================================
-- Allowlist: name, username, hashid, joining_reason, onboarding_completed
-- Protected: is_admin, credits, account_tier, status, date_joined, email

-- Drop the old partial trigger first
DROP TRIGGER IF EXISTS protect_admin_column_trigger ON public.users;
DROP FUNCTION IF EXISTS public.protect_admin_column();

CREATE OR REPLACE FUNCTION public.protect_users_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Allow service_role and postgres full access
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Block changes to protected columns
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Permission denied: cannot modify is_admin';
  END IF;

  IF NEW.credits IS DISTINCT FROM OLD.credits THEN
    RAISE EXCEPTION 'Permission denied: cannot modify credits';
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

CREATE TRIGGER protect_users_sensitive_columns_trigger
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_users_sensitive_columns();

COMMENT ON FUNCTION public.protect_users_sensitive_columns() IS
'Blocks non-service-role callers from modifying sensitive user columns (is_admin, credits, account_tier, status, date_joined, email). Users can only modify: name, username, hashid, joining_reason, onboarding_completed.';


-- ============================================================================
-- 2. TASKS TABLE — Protect pipeline columns
-- ============================================================================
-- Allowlist: name, input_data
-- Protected: everything else (status, progress, output, steps, etc.)

CREATE OR REPLACE FUNCTION public.protect_tasks_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Allow service_role and postgres full access
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Block changes to pipeline-managed columns
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

CREATE TRIGGER protect_tasks_sensitive_columns_trigger
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_tasks_sensitive_columns();

COMMENT ON FUNCTION public.protect_tasks_sensitive_columns() IS
'Blocks non-service-role callers from modifying pipeline-managed task columns. Users can only modify: name, input_data.';


-- ============================================================================
-- 3. MONTHLY STATEMENTS — Protect commission and payment status
-- ============================================================================
-- Allowlist: total_revenue, costs, revenue_proof_url, payment_proof_url, 
--            status (only draft→pending_verification), updated_at
-- Protected: commission_rate, paid_at

CREATE OR REPLACE FUNCTION public.protect_monthly_statements_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Allow service_role and postgres full access
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Block changes to commission_rate
  IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
    RAISE EXCEPTION 'Permission denied: cannot modify commission_rate';
  END IF;

  -- Block changes to paid_at
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify paid_at';
  END IF;

  -- Restrict status transitions: users can only go draft→pending_verification
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'draft' AND NEW.status = 'pending_verification') THEN
      RAISE EXCEPTION 'Permission denied: invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_monthly_statements_sensitive_columns_trigger
  BEFORE UPDATE ON public.monthly_statements
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_monthly_statements_sensitive_columns();

COMMENT ON FUNCTION public.protect_monthly_statements_sensitive_columns() IS
'Blocks non-service-role callers from modifying commission_rate and paid_at. Restricts status transitions to draft→pending_verification only.';


-- ============================================================================
-- 4. USER GCP CONFIG — Protect token and server-managed state columns
-- ============================================================================
-- Allowlist: project_id, region, zone, instance_name, machine_type,
--            gpu_auto_shutdown_minutes, metadata, updated_at
-- Protected: gcp_refresh_token, gcp_access_token, gcp_token_expires_at,
--            status, external_ip, last_seen_at, last_gpu_activity_at

CREATE OR REPLACE FUNCTION public.protect_user_gcp_config_sensitive_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  -- Allow service_role and postgres full access
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR session_user = 'postgres' THEN
    RETURN NEW;
  END IF;

  -- Block changes to token/credentials columns
  IF NEW.gcp_refresh_token IS DISTINCT FROM OLD.gcp_refresh_token THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_refresh_token';
  END IF;

  IF NEW.gcp_access_token IS DISTINCT FROM OLD.gcp_access_token THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_access_token';
  END IF;

  IF NEW.gcp_token_expires_at IS DISTINCT FROM OLD.gcp_token_expires_at THEN
    RAISE EXCEPTION 'Permission denied: cannot modify gcp_token_expires_at';
  END IF;

  -- Block changes to server-managed state columns
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

CREATE TRIGGER protect_user_gcp_config_sensitive_columns_trigger
  BEFORE UPDATE ON public.user_gcp_config
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_gcp_config_sensitive_columns();

COMMENT ON FUNCTION public.protect_user_gcp_config_sensitive_columns() IS
'Blocks non-service-role callers from modifying GCP tokens and server-managed state. Users can modify: project_id, region, zone, instance_name, machine_type, gpu_auto_shutdown_minutes, metadata, updated_at.';
