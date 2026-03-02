-- ============================================================================
-- GPU Hours & Stripe Integration
-- ============================================================================
-- Renames credits → gpu_hours_balance, adds Stripe customer tracking,
-- creates an audit ledger, and atomic RPC functions for crediting/debiting.
-- ============================================================================

-- ============================================================================
-- 1. RENAME credits → gpu_hours_balance on users table
-- ============================================================================
ALTER TABLE public.users RENAME COLUMN credits TO gpu_hours_balance;

-- Ensure it's INTEGER NOT NULL DEFAULT 0
ALTER TABLE public.users
  ALTER COLUMN gpu_hours_balance SET NOT NULL,
  ALTER COLUMN gpu_hours_balance SET DEFAULT 0;

-- ============================================================================
-- 2. ADD stripe_customer_id to users table
-- ============================================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- ============================================================================
-- 3. UPDATE Phase 1 trigger to also protect gpu_hours_balance & stripe_customer_id
-- ============================================================================
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
-- 4. GPU HOURS TRANSACTIONS LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.gpu_hours_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'deduction', 'refund', 'admin_adjustment')),
  hours INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  stripe_session_id TEXT,
  video_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gpu_hours_transactions OWNER TO postgres;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_gpu_hours_transactions_user_id
  ON public.gpu_hours_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_gpu_hours_transactions_stripe_session
  ON public.gpu_hours_transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Enable RLS: users can only SELECT their own rows, no client writes
ALTER TABLE public.gpu_hours_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.gpu_hours_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access on gpu_hours_transactions"
  ON public.gpu_hours_transactions
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 5. CREDIT GPU HOURS RPC (called from webhook via service_role)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.credit_gpu_hours(
  p_user_id UUID,
  p_hours INTEGER,
  p_stripe_session_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance INTEGER;
  v_existing_txn UUID;
BEGIN
  -- Validate inputs
  IF p_hours <= 0 THEN
    RAISE EXCEPTION 'Hours must be positive, got %', p_hours;
  END IF;

  -- Idempotency check: skip if this stripe session already credited
  IF p_stripe_session_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn
    FROM gpu_hours_transactions
    WHERE stripe_session_id = p_stripe_session_id
      AND type = 'purchase'
    LIMIT 1;

    IF v_existing_txn IS NOT NULL THEN
      -- Already processed, return current balance
      SELECT gpu_hours_balance INTO v_new_balance
      FROM users WHERE id = p_user_id;
      RETURN v_new_balance;
    END IF;
  END IF;

  -- Atomically update balance
  UPDATE users
  SET gpu_hours_balance = gpu_hours_balance + p_hours
  WHERE id = p_user_id
  RETURNING gpu_hours_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- Insert ledger entry
  INSERT INTO gpu_hours_transactions (user_id, type, hours, balance_after, stripe_session_id, description)
  VALUES (p_user_id, 'purchase', p_hours, v_new_balance, p_stripe_session_id,
          format('Purchased %s GPU hours via Stripe', p_hours));

  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.credit_gpu_hours(UUID, INTEGER, TEXT) IS
'Atomically credits GPU hours to a user after a Stripe purchase. Idempotent on stripe_session_id.';

-- ============================================================================
-- 6. DEDUCT GPU HOURS RPC (called from render API via service_role)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.deduct_gpu_hours(
  p_user_id UUID,
  p_hours INTEGER,
  p_video_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'Video render'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Validate inputs
  IF p_hours <= 0 THEN
    RAISE EXCEPTION 'Hours must be positive, got %', p_hours;
  END IF;

  -- Lock the row and check balance
  SELECT gpu_hours_balance INTO v_current_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  IF v_current_balance < p_hours THEN
    RAISE EXCEPTION 'Insufficient GPU hours: have %, need %', v_current_balance, p_hours;
  END IF;

  -- Deduct
  v_new_balance := v_current_balance - p_hours;

  UPDATE users
  SET gpu_hours_balance = v_new_balance
  WHERE id = p_user_id;

  -- Insert ledger entry (negative hours for deduction)
  INSERT INTO gpu_hours_transactions (user_id, type, hours, balance_after, video_id, description)
  VALUES (p_user_id, 'deduction', -p_hours, v_new_balance, p_video_id, p_description);

  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.deduct_gpu_hours(UUID, INTEGER, UUID, TEXT) IS
'Atomically deducts GPU hours from a user for rendering. Uses SELECT FOR UPDATE to prevent race conditions. Raises exception if insufficient balance.';
