-- Add paid_at column to monthly_statements
ALTER TABLE public.monthly_statements
ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Backfill existing paid records with updated_at (best guess)
UPDATE public.monthly_statements
SET paid_at = updated_at
WHERE status = 'paid' AND paid_at IS NULL;

-- Function to automatically set paid_at when status changes to 'paid'
CREATE OR REPLACE FUNCTION public.handle_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- If status is changing to 'paid', set paid_at to now()
    IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
        NEW.paid_at = now();
    -- If status is changing FROM 'paid' to something else (e.g. reset), clear paid_at
    ELSIF OLD.status = 'paid' AND NEW.status != 'paid' THEN
        NEW.paid_at = NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger to call the function
DROP TRIGGER IF EXISTS set_paid_at_trigger ON public.monthly_statements;
CREATE TRIGGER set_paid_at_trigger
    BEFORE INSERT OR UPDATE ON public.monthly_statements
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_payment_status_change();

-- Update the RPC to include the new column (explicitly selecting it to be safe, though SELECT * usually works)
-- We'll just refresh the function definition to be sure.
CREATE OR REPLACE FUNCTION public.get_user_payment_history(target_user_id uuid)
RETURNS SETOF public.monthly_statements
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Check if requester is admin
    IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.is_admin = true) THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    RETURN QUERY
    SELECT *
    FROM public.monthly_statements
    WHERE user_id = target_user_id
    ORDER BY month_date DESC;
END;
$$;
