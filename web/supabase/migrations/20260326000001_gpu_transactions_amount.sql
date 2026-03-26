-- ============================================================================
-- GPU Hours Transactions: Store actual dollar amount from Stripe
-- ============================================================================
-- Adds amount_cents column to gpu_hours_transactions to track the actual
-- payment amount from Stripe checkout sessions. This is more robust than
-- deriving from hours * rate, as pricing may change over time.
-- ============================================================================

-- 1. Add amount_cents column
ALTER TABLE public.gpu_hours_transactions
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER;

COMMENT ON COLUMN public.gpu_hours_transactions.amount_cents IS
  'Actual payment amount in cents from Stripe session.amount_total. NULL for non-purchase entries.';

-- 2. Backfill existing purchase rows: $1/hour = 100 cents/hour
UPDATE public.gpu_hours_transactions
  SET amount_cents = ABS(hours) * 100
  WHERE type = 'purchase' AND amount_cents IS NULL;

-- 3. Update credit_gpu_hours RPC to accept and store amount_cents
CREATE OR REPLACE FUNCTION public.credit_gpu_hours(
  p_user_id UUID,
  p_hours INTEGER,
  p_stripe_session_id TEXT,
  p_amount_cents INTEGER DEFAULT NULL
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

  -- Insert ledger entry with amount_cents
  INSERT INTO gpu_hours_transactions (user_id, type, hours, balance_after, stripe_session_id, amount_cents, description)
  VALUES (p_user_id, 'purchase', p_hours, v_new_balance, p_stripe_session_id,
          COALESCE(p_amount_cents, p_hours * 100),
          format('Purchased %s GPU hours via Stripe', p_hours));

  RETURN v_new_balance;
END;
$$;

COMMENT ON FUNCTION public.credit_gpu_hours(UUID, INTEGER, TEXT, INTEGER) IS
  'Atomically credits GPU hours to a user after a Stripe purchase. Stores actual dollar amount. Idempotent on stripe_session_id.';
